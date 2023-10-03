import { Collider, MeshRenderer } from "../components";
import { lineWithDiretionIntersection, segmentWithSegmentIntersection } from "../utils";
import { Collision } from "./collision";
import { Entity } from "./entity";
import { Scene } from "./scene";
import { Shape } from "./shape";
import { SpatialPartition } from "./spatial-partition/spatial-partition";
import { Vector } from "./vector";

export interface RayResolution {
  pivot: Vector,
  distance: number,
  direction: Vector,
  intersectionPosition: Vector,
  segment: Shape.Segment,
}

export interface SceneRayResolution extends RayResolution {
  segmentVertexIndexes: readonly [number, number],
  entity: Entity,
  shape: Shape;
}

export interface ShapeRayResolution extends RayResolution {
  segmentVertexIndexes: readonly [number, number],
  shape: Shape;
}

export interface RayResearchOptions {
  segmentMask?: Shape.Segment[];
  shapeMask?: Shape[];
}

export interface RayCastOptions extends RayResearchOptions {
}

export type RayEntityShapeDriller = (entity: Entity) => Shape | null | undefined;

export class Ray {
  public entityShapeDriller: RayEntityShapeDriller = (entity) => {
    const vertices = entity.components.findOfType(Collider)?.relativeVerticesPosition();
    if (vertices) {
      return new Shape(vertices);
    }
  }

  public readonly endpoint: Vector;
  constructor(readonly pivot: Vector, readonly direction: Vector, readonly distance = Infinity) {
    this.endpoint = pivot.add(direction.multiply(distance))
  }

  cast(scene: Scene, options?: RayCastOptions): SceneRayResolution | null;
  cast(shapes: Shape[] | readonly Shape[], options?: RayCastOptions): ShapeRayResolution | null;
  cast(input: Scene | Shape[] | readonly Shape[], options?: RayCastOptions) {
    if (input instanceof Scene) {
      const entityShapeMap = new Map<Shape, Entity>();
      for (const entity of input) {
        const shape = this.entityShapeDriller(entity);
        if (!shape) {
          continue;
        }

        entityShapeMap.set(shape, entity);
      }

      const resolution = this.shapeCast(Array.from(entityShapeMap.keys()), options);
      if (!resolution) {
        return null;
      }

      return { 
        entity: entityShapeMap.get(resolution.shape),
        ...resolution,
      }
    }

    const resolution = this.shapeCast(input, options);
    return resolution;
  }

  shapeCast(shapes: Shape[] | readonly Shape[], options: RayCastOptions = {}) {
    const researchResolutions = this.shapeResearch(shapes, options);
    const nearestResolution = this.nearestResolution(researchResolutions);
    return nearestResolution;
  }

  research(scene: Scene, options?: RayResearchOptions): SceneRayResolution[];
  research(shapes: Shape[] | readonly Shape[], options?: RayResearchOptions): ShapeRayResolution[];
  research(input: Scene | Shape[] | readonly Shape[], options: RayResearchOptions = {}) {
    if (input instanceof Scene) {
      const entityShapeMap = new Map<Shape, Entity>();
      for (const entity of input.getEntities()) {
        const shape = this.entityShapeDriller(entity);
        if (!shape) {
          continue;
        }

        entityShapeMap.set(shape, entity);
      }

      const resolutions = this.shapeResearch(Array.from(entityShapeMap.keys()), options);
      return resolutions.map(resolution => ({
        entity: entityShapeMap.get(resolution.shape),
        ...resolution,
      }));
    }

    const resolutions = this.shapeResearch(input, options);
    return resolutions;
  }

  shapeResearch(shapes: Shape[] | readonly Shape[], options: RayResearchOptions = {}) {
    const { shapeMask = [], segmentMask = [] } = options;

    const resolutions: ShapeRayResolution[] = [];

    for (const shape of shapes) {
      if (shapeMask.includes(shape)) {
        continue;
      }

      for (const segment of shape.segments) {
        if (segmentMask.includes(segment)) {
          continue;
        }

        const intersectionPosition = this.detect(segment[0], segment[1]);
        if (!intersectionPosition || Vector.distance(this.pivot, intersectionPosition) > this.distance) {
          continue;
        }

        const segmentVertexIndexes = [
          shape.vertices.indexOf(segment[0]),
          shape.vertices.indexOf(segment[1]),
        ] as const;
  
        resolutions.push({
          pivot: this.pivot,
          distance: this.distance,
          direction: this.direction,
          intersectionPosition,
          segmentVertexIndexes,
          segment,
          shape,
        })
      }
    }

    return resolutions;
  }

  researchOpenStacks(shapes: Shape[] | readonly Shape[], options: RayResearchOptions = {}) {
    const resolutions = this.research(shapes, options);

    const openStack = new Set<Shape>();
    for (const resolution of resolutions) {
      const { shape } = resolution;
      if (openStack.has(shape)) {
        openStack.delete(shape);
      } else {
        openStack.add(shape);
      }
    }

    return openStack;
  }

  public nearestResolution<T extends RayResolution>(resolutions: T[]) {
    let nearestResolution: T | null = null;
    let distanceRecord = Infinity;
    
    for (const resolution of resolutions) {
      const distance = Vector.distance(this.pivot, resolution.intersectionPosition);
      if (distanceRecord < distance) {
        continue;
      }
      
      nearestResolution = resolution;
      distanceRecord = distance;
    }

    return nearestResolution;
  }

  public static escape(position: Vector) {
    return new Ray(position, Vector.right, Infinity);
  }

  public detect(startVertex: Vector, endVertex: Vector) {
    const intersection = lineWithDiretionIntersection(this.pivot, this.direction, [startVertex, endVertex]);
    return intersection;
  }

  public detectX(startVertex: Vector, endVertex: Vector) {
    const intersection = segmentWithSegmentIntersection([this.pivot, this.endpoint], [startVertex, endVertex]);
    return intersection;
  }


  public static isPointInside(scene: Scene, point: Vector) {
    const ray = new Ray(point, Vector.right)
    const resolutions = ray.research(scene);

    const stack = new Set<Entity>();
    for (const resolution of resolutions) {
      const { entity } = resolution;
      if (stack.has(entity)) {
        stack.delete(entity);
      } else {
        stack.add(entity);
      }
    }

    return stack.size > 0;
  }

  public static isPointInsideShape(shape: Shape, point: Vector) {
    const ray = new Ray(point, Vector.right)
    const resolutions = ray.shapeResearch([shape]);
    return resolutions.length === 1;
  }

  // MeshRenderer Spatial Partiation
  public useMRSP(meshRendererSpatialPartition: SpatialPartition<MeshRenderer>) {
    if (this.distance === Infinity) {
      throw new Error('While using incrimental raycast, the distance must be defined');
    }

    const cast = (options?: RayCastOptions) => {
      const { shapeMask = [], segmentMask = [] } = options ?? {};

      type MRSPSceneRayResolution = SceneRayResolution & {
        meshRenderer: MeshRenderer;
      }

      let rayResolution: MRSPSceneRayResolution | null = null;
      const clusterGenerator = meshRendererSpatialPartition.rayTraceClusters(this.pivot, this.endpoint);

      const a = new Map<MeshRenderer, Shape>();
      for (const cluster of clusterGenerator) {
        const heightTrace = meshRendererSpatialPartition.getHeightTrace(cluster);
        const meshRenderers = heightTrace.map(branch => [...branch.elements]).flat();

        const shapes: Shape[] = [];
        
        // TODO Optimize (save intersections out of the box, and use them to calculate the nearest one in the next iterations)
        for (const meshRenderer of meshRenderers) {
          const aa = a.get(meshRenderer);
          if (aa) {
            shapes.push(aa);
          } else {
            const shape = new Shape(meshRenderer.relativeVerticesPosition());
            shapes.push(shape);
            a.set(meshRenderer, shape);
          }
        }

        const resolutions: MRSPSceneRayResolution[] = [];
        for (const shape of shapes) {
          for (const segment of shape.segments) {
            const intersectionPosition = this.detectX(...segment);
            if (!intersectionPosition) {
              continue;
            }

            const segmentVertexIndexes = [
              shape.vertices.indexOf(segment[0]),
              shape.vertices.indexOf(segment[1]),
            ] as const;

            const aa = [...a].find(([m, sh]) => sh === shape)?.[0]!;
      
            resolutions.push({
              pivot: this.pivot,
              distance: this.distance,
              direction: this.direction,
              intersectionPosition,
              segmentVertexIndexes,
              segment,
              shape,
              entity: aa.entity,
              meshRenderer: aa,
            })
          }
        }

        rayResolution = this.nearestResolution(resolutions);
        if (rayResolution) {
          break;
        }
      }

      return rayResolution;
    }

    return {
      cast
    }
  }
}