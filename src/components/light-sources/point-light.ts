import { Color, Entity, Optic, Ray, Renderer, RenderingPipeline, Scene, Segment, Shape, ShapeIntersection, Transform, Vector } from "../../core";
import { Gizmos } from "../../core/gizmos";
import { SimulationRenderer } from "../../renderers";
import { SimulationRenderingPipeline } from "../../rendering-pipelines";
import { Rectangle } from "../../shapes";
import { lineWithLineIntersection, rotatedOffsetPosition, segmentWithSegmentIntersection } from "../../utils";
import { Camera } from "../camera";
import { LightSource } from "../light";

interface RaycastCheckpoint {
  exposed: Vector,
  endpoint?: Vector,
  endpointSegment?: Segment,
}

const boundsOverlaping = (a: Shape, b: Shape) => {
  const av = a.vertices;
  const bv = b.vertices;

  return av[1].x > bv[0].x && av[0].x < bv[1].x && av[0].y > bv[3].y && av[3].y < bv[0].y;
}

export class PointLight extends LightSource {
  public range = 20;
  public color = Color.white;
  public ignoreOverlapEntity = false;
  
  private readonly raycastInaccuracy = 0.00001;

  private fps = 0;
  private rerateFPS = true;

  start() {
    setInterval(() => {
      this.rerateFPS = true;
    }, 500);
  }

  render(simulationRenderingPipeline: SimulationRenderingPipeline) {
    const { renderer } = simulationRenderingPipeline;
    const res = this.getMaskInfo(renderer);
    if (!res) {
      return;
    }

    const { maskPath } = res;

    const { remove: removeMask } = simulationRenderingPipeline.createMask(Array.from(maskPath));

    simulationRenderingPipeline.renderRadialGradient(this.transform.position, this.range, [{
      offset: 0,
      color: this.color,
    }, {
      offset: 0.5,
      color: Color.transparent,
    }]);

    removeMask();
  }

  gizmosRender(gizmos: Gizmos) {
    

    const resolution = this.getMaskInfo(gizmos.renderer);

    const {
      checkpointRaycasts,
      maskPath,
      shapeInterimVertices,
      checkpointVertices,
      lightBoundsInterimVertices,
    } = resolution ?? {};
    
    const lineColor = new Color(0, 0, 255, 0.1);
    const vertexColor = Color.blue;
    const vertexHighlightRadius = 0.1
    
    gizmos.highlightVertices(new Rectangle().withScale(this.range).withOffset(this.transform.position).vertices, new Color(0, 0, 255, 0.1))
    
    if (maskPath) {
      gizmos.highlightVertices(Array.from(maskPath), Color.blue);
    }

    if (maskPath) {
      for (let i = 0; i < maskPath.length; i++) {
        gizmos.renderLine(this.transform.position, maskPath[i], lineColor);
        gizmos.renderFixedText(maskPath[i], `${i + 1}`, 0.35, Color.red);
      }
    }

    if (this.rerateFPS) {
      this.rerateFPS = false;
      this.fps = Math.min(60, Number(gizmos.renderer.fps.toFixed(0)));
    }
    
    const list = [
      `${this.fps} fps`,
      '',
      `${checkpointVertices?.length ?? 0} total checkpoint vertices`,
      `${shapeInterimVertices?.length ?? 0} entity to entity overlaping vertices`,
      `${lightBoundsInterimVertices?.length ?? 0} entity overlap vertices with light bounds`,
      '',
      `${checkpointRaycasts?.length ?? 0} mask checkpoint raycasts`,
      `${maskPath?.length ?? 0} mask path vertices`,
    ]

    for (let i = 0; i < list.length; i++) {
      gizmos.renderStaticText(new Vector(-16, 3 - i / 2), list[i], 0.5);
    }
  }

  public getBounds() {
    const scale = Vector.one.multiply(this.range);
    const boundsTransform = Transform.setScale(scale).setPosition(this.transform.position)
    return new Rectangle().withTransform(boundsTransform);
  }

  public getSegmentVerticesUtils() {
    // To keep track of the vertecies that belongs to specific shape segments (Is needed for mask connection)
    const segmentVertices = new Map<Segment, Vector[]>();
    const addSegmentVertices = (segment: Segment, ...additionalVertices: Vector[]) => {
      const vertices = segmentVertices.get(segment);
      if (!vertices) {
        segmentVertices.set(segment, [...additionalVertices]);
        return;
      }

      vertices.push(...additionalVertices);
    }

    const verticesShareSegment = (a: Vector, b: Vector) => 
      Array.from(segmentVertices.values()).some(vertices => vertices.includes(a) && vertices.includes(b));

    return {
      segmentVertices,
      addSegmentVertices,
      verticesShareSegment,
    }
  }

  private getEntityShapes(lightBounds: Shape) {
    const scene = this.entity.getScene();

    const entityShapes: Shape[] = [];
    for (const entity of scene) {
      const componentInstance = entity.components.find(this.physicalRenderingDependence);
      if (!componentInstance) {
        continue;
      }
      
      const positionedVertices = componentInstance.relativeVerticesPosition();
      const positionedShape = new Shape(positionedVertices);

      const entityBounds = new Shape(positionedVertices).bounds;
      if (!boundsOverlaping(entityBounds, lightBounds)) {
        continue;
      }

      entityShapes.push(positionedShape);
    }

    return entityShapes;
  }

  public overlapsShape(shapes: Shape[], shapeMask: Shape[]) {;
    const escapeRay = Ray.escape(this.transform.position);
    const escapeRayOpenStack = escapeRay.researchOpenStacks(shapes, { shapeMask: shapeMask });
    return escapeRayOpenStack.size !== 0;
  }

  private getMaskInfo(renderer: SimulationRenderer) {
    const { segmentVertices, addSegmentVertices, verticesShareSegment } = this.getSegmentVerticesUtils();

    const lightBounds = this.getBounds();
    
    const entityShapes = this.getEntityShapes(lightBounds);
    const checkpointVertices: Vector[] = [...lightBounds.vertices, ...entityShapes.map(shape => shape.vertices).flat()];
    const entitySegments: Segment[] = entityShapes.map(shape => shape.segments).flat();
    
    lightBounds.segments.forEach(segment => addSegmentVertices(segment, ...segment));
    entitySegments.forEach(segment => addSegmentVertices(segment, ...segment));
    
    const checkpointRaycasts: RaycastCheckpoint[] = [];

    // Check if shape is overlaping the light
    if (this.overlapsShape(entityShapes, [lightBounds])) {
      return;
    }
    
    const shapesWithLightBoundsIntersections = entityShapes.map(shape => Shape.intersections(lightBounds, shape)).flat();
    const lightBoundsInterimVertices: Vector[] = [];
    for (const intersection of shapesWithLightBoundsIntersections) {
      const { position, segmentHolders } = intersection
      checkpointVertices.push(position);
      lightBoundsInterimVertices.push(position);
      segmentHolders.forEach(holder => addSegmentVertices(holder, position))
    }

    // Vertices which are intersects of entity segments
    const shapeWithShapeIntersections: ShapeIntersection[] = [];
    for (let i = 0; i < entityShapes.length; i++) {
      for (let j = i + 1; j < entityShapes.length; j++) {
        const intersection = Shape.intersections(entityShapes[i], entityShapes[j]);
        if (!intersection) {
          continue;
        }

        shapeWithShapeIntersections.push(...intersection);
      }
    }

    const shapeInterimVertices: Vector[] = [];
    for (const intersection of shapeWithShapeIntersections) {
      const { position, segmentHolders } = intersection
      checkpointVertices.push(position);
      shapeInterimVertices.push(position);
      segmentHolders.forEach(holder => addSegmentVertices(holder, position))
    }

    // Create raycast checkpoints
    const shapes: Shape[] = [lightBounds, ...entityShapes];
    for (const vertex of checkpointVertices) {
      const relativeVertexPosition = vertex.subtract(this.transform.position); // Not normalized for precision safety
      const exposedRayCollision = new Ray(this.transform.position, relativeVertexPosition).cast(shapes);

      if (!exposedRayCollision?.intersectionPosition.isAlmostEqual(vertex, this.raycastInaccuracy)) {
        // The ray hitted something before the target vertex
        continue;
      }

      if (
        shapeInterimVertices.includes(vertex) ||
        lightBounds.vertices.includes(vertex) ||
        lightBoundsInterimVertices.includes(vertex)
      ) {
        // No need for secondary ray casting because it is a "special" vertex
        checkpointRaycasts.push({
          exposed: vertex,
        });

        continue;
      }

      const segmentsConnectedToTargetVertex: Segment[] = [];
      for (const [segment, vertices] of segmentVertices) {
        if (vertices.includes(vertex)) {
          segmentsConnectedToTargetVertex.push(segment);
        }
      }

      const secondaryRayCollision = new Ray(vertex, relativeVertexPosition).cast(shapes, { 
        segmentMask: segmentsConnectedToTargetVertex 
      });

      if (!secondaryRayCollision) {
        throw new Error('Area light endpoint ray did not overlap with its boundary box.');
      }

      const secondaryRayDifferenceSize = secondaryRayCollision.intersectionPosition.subtract(vertex);
      const secondaryRayDifferenceCenter = vertex.add(secondaryRayDifferenceSize.divide(2));
      const openStackEscape = Ray.escape(secondaryRayDifferenceCenter).researchOpenStacks(entityShapes);
      const shapeOverlapsLightSource = openStackEscape.size > 0;

      if (!shapeOverlapsLightSource) {
        checkpointRaycasts.push({
          exposed: vertex,
          endpoint: secondaryRayCollision.intersectionPosition,
          endpointSegment: secondaryRayCollision.segment,
        })
  
        addSegmentVertices(secondaryRayCollision.segment, secondaryRayCollision.intersectionPosition);
      } else {
        checkpointRaycasts.push({
          exposed: vertex,
        })
      }
    }
    
    const maskPath: Vector[] = [];
    const relativeCheckpointRotation = (vertex: Vector) => vertex.subtract(this.transform.position).rotation();
    checkpointRaycasts.sort((a, b) => relativeCheckpointRotation(a.exposed) - relativeCheckpointRotation(b.exposed));

    // Create mask path
    for (let i = 0; i < checkpointRaycasts.length; i++) {
      const segmentInfo = checkpointRaycasts[i];
      const previousIndex = i === 0 ? checkpointRaycasts.length - 1 : i - 1;
      const previousSegmentInfo = checkpointRaycasts[previousIndex];

      if (verticesShareSegment(segmentInfo.exposed, previousSegmentInfo.exposed)) {
        maskPath.push(segmentInfo.exposed);
        if (segmentInfo.endpoint) {
          maskPath.push(segmentInfo.endpoint);
        }
        continue;
      }

      if (segmentInfo.endpoint && previousSegmentInfo.endpoint && verticesShareSegment(segmentInfo.endpoint, previousSegmentInfo.endpoint)) {
        maskPath.push(segmentInfo.endpoint);
        maskPath.push(segmentInfo.exposed);
        continue;
      }

      if (segmentInfo.endpoint && verticesShareSegment(segmentInfo.endpoint, previousSegmentInfo.exposed)) {
        maskPath.push(segmentInfo.endpoint);
        maskPath.push(segmentInfo.exposed);
        continue;
      }

      if (previousSegmentInfo.endpoint && verticesShareSegment(segmentInfo.exposed, previousSegmentInfo.endpoint)) {
        maskPath.push(segmentInfo.exposed);
        if (segmentInfo.endpoint) {
          maskPath.push(segmentInfo.endpoint);
        }
      }
    }

    return {
      lightBounds,
      checkpointVertices,
      checkpointRaycasts,
      shapeInterimVertices,
      lightBoundsInterimVertices,
      maskPath,
    };
  }
}