import { Collider } from "../components";
import { lineWithDiretionIntersection } from "../utils";
import { Collision } from "./collision";
import { Entity } from "./entity";
import { Scene } from "./scene";
import { Shape } from "./shape";
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

  constructor(readonly pivot: Vector, readonly direction: Vector, readonly distance = Infinity) {}

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

  // private castScene(scene: Scene): SceneRayResolution | null {
  //   let closestResolution: SceneRayResolution | null = null;
  //   let distanceRecord = Infinity;

  //   for (const entity of scene) {
  //     const collider = entity.components.findOfType(Collider);
  //     if (!collider) {
  //       continue;
  //     }

  //     const vertices = collider.relativeVerticesPosition();
  //     const { segmentVertexIndexes } = new Shape(vertices);
  //     for (const [i, j] of segmentVertexIndexes) {
  //       const vertex = vertices[i];
  //       const nextVertex = vertices[j];

  //       const detectedAt = this.detect(vertex, nextVertex);
  //       if (!detectedAt) {
  //         continue;
  //       }

  //       const distance = Vector.distance(this.pivot, detectedAt);
  //       if (distance < distanceRecord) {
  //         distanceRecord = distance;
  //         closestResolution = {
  //           segmentVertexIndexes: [i, j],
  //           segment: [vertex, nextVertex],
  //           intersectionPosition: detectedAt,
  //           collider,
  //           entity,
  //         };
  //       }
  //     }
  //   }

  //   return closestResolution;
  // }

  // private castSegments(segments: Segment[]): RayResolution | null {
  //   let closestResolution: RayResolution | null = null;
  //   let distanceRecord = Infinity;

  //   for (const segment of segments) {
  //     const detectedAt = this.detect(segment[0], segment[1]);
  //     if (!detectedAt) {
  //       continue;
  //     }

  //     const distance = Vector.distance(this.pivot, detectedAt);
  //     if (distance < distanceRecord) {
  //       distanceRecord = distance;
  //       closestResolution = {
  //         intersectionPosition: detectedAt,
  //         segment,
  //       };
  //     }
  //   }

  //   return closestResolution;
  // }

  // research(scene: Scene): SceneRayResolution[];
  // research(scene: Scene): SceneRayResolution[];
  // research(segments: Segment[] | readonly Segment[]): RayResolution[];
  // research(input: Scene | Segment[] | readonly Segment[]) {
  //   if (input instanceof Scene) {
  //     return this.researchScene(input);
  //   }

  //   return this.researchSegments(input);
  // }

  // private researchScene(scene: Scene) {
  //   const resolutions: SceneRayResolution[] = [];

  //   for (const entity of scene) {
  //     const collider = entity.components.findOfType(Collider);
  //     if (!collider) {
  //       continue;
  //     }

  //     const vertices = collider.relativeVerticesPosition();
  //     const { segmentVertexIndexes } = new Shape(vertices);
  //     for (const [i, j] of segmentVertexIndexes) {
  //       const vertex = vertices[i];
  //       const nextVertex = vertices[j];

  //       const detectedAt = this.detect(vertex, nextVertex);
  //       if (!detectedAt) {
  //         continue;
  //       }

  //       resolutions.push({
  //         segmentVertexIndexes: [i, j],
  //         intersectionPosition: detectedAt,
  //         segment: [vertex, nextVertex],
  //         collider,
  //         entity,
  //       })
  //     }
  //   }

  //   return resolutions;
  // }

  // private researchSegments(segments: Segment[] | readonly Segment[]) {
  //   const resolutions: RayResolution[] = [];
  //   for (const segment of segments) {
  //     const detectedAt = this.detect(segment[0], segment[1]);
  //     if (!detectedAt) {
  //       continue;
  //     }

  //     resolutions.push({
  //       intersectionPosition: detectedAt,
  //       segment,
  //     })
  //   }

  //   return resolutions;
  // }

  public detect(startVertex: Vector, endVertex: Vector) {
    const intersection = lineWithDiretionIntersection(this.pivot, this.direction, [startVertex, endVertex]);
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
}