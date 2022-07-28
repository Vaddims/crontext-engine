import { Color, Entity, Ray, Scene, Segment, Shape, Vector } from "../../core";
import { Gizmos } from "../../core/gizmos";
import { SimulationRenderingPipeline } from "../../rendering-pipelines";
import { Rectangle } from "../../shapes";
import { lineWithLineIntersection, rotatedOffsetPosition, segmentWithSegmentIntersection } from "../../utils";
import { LightSource } from "../light";

interface RaycastCheckpoint {
  exposed: Vector,
  endpoint?: Vector,
  endpointSegment?: Segment,
}

function circluarVectorComparison(a: Vector, b: Vector) {
  return Math.atan2(a.y, a.x) > Math.atan2(b.y, b.x) ? 1 : -1;
  // starting at PI rad and rotate anticlockwise (positive)
}

export class AreaLight extends LightSource {
  public radius = 50;
  public color = Color.white;
  public ignoreOverlapEntity = false;
  
  private readonly raycastInaccuracy = 0.00001;

  render(renderer: SimulationRenderingPipeline) {
    const scene = this.entity.tryGetScene();
    if (!scene) {
      return;
    }

    const res = this.getMaskInfo(scene);
    if (!res) {
      return;
    }

    const { maskPath } = res;

    const { remove: removeMask } = renderer.createMask(Array.from(maskPath));

    renderer.renderRadialGradient(this.transform.position, this.radius, [{
      offset: 0,
      color: this.color,
    }, {
      offset: 0.5,
      color: Color.transparent,
    }]);

    removeMask();
  }

  gizmosRender(gizmos: Gizmos) {
    const resolution = this.getMaskInfo(gizmos.currentScene);

    if (!resolution) {
      return;
    }

    const {
      raycastCheckpoints,
      maskPath,
      segmentOverlappingVertices,
      checkpointVertices,
    } = resolution;
    
    const lineColor = new Color(0, 0, 255, 0.4);
    const vertexColor = Color.blue;
    const vertexHighlightRadius = 0.1

    for (let i = 0; i < raycastCheckpoints.length; i++) {
      const segmentInfo = raycastCheckpoints[i];
      gizmos.renderLine(this.transform.position, segmentInfo.exposed, lineColor)
      gizmos.renderFixedDisk(segmentInfo.exposed, vertexHighlightRadius, vertexColor);
      if (segmentInfo.endpoint) {
        gizmos.renderLine(segmentInfo.exposed, segmentInfo.endpoint, lineColor)
        gizmos.renderFixedDisk(segmentInfo.endpoint, vertexHighlightRadius, vertexColor);
      }
    }

    gizmos.highlightVertices(Array.from(maskPath), Color.blue);
    for (const vertex of segmentOverlappingVertices) {
      gizmos.renderFixedCircle(vertex, 0.1, Color.yellow);
    }

    for (const vertex of checkpointVertices) {
      gizmos.renderFixedCircle(vertex, 0.1, Color.green);
    }
  }

  private getMaskInfo(scene: Scene) {
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

    const lightBounds = new Rectangle().withScale(this.radius).withOffset(this.transform.position);
    for (const segment of lightBounds.segments) {
      addSegmentVertices(segment, ...segment);
    }

    const checkpointVertices: Vector[] = [...lightBounds.vertices];
    const raycastCheckpoints: RaycastCheckpoint[] = [];
    
    const verticesShareSegment = (a: Vector, b: Vector) => 
      Array.from(segmentVertices.values()).some(vertices => vertices.includes(a) && vertices.includes(b));
    
    const entitySegments: Segment[] = [];
    
    for (const entity of scene) {
      const componentInstance = entity.components.find(this.physicalRenderingDependence);
      if (!componentInstance) {
        continue;
      }
      
      const positionedVertices = componentInstance.relativeVerticesPosition();
      const positionedSegments = new Shape(positionedVertices).segments;
      
      if (Ray.isPointInsideSegments(positionedSegments, this.transform.position)) {
        if (this.ignoreOverlapEntity) {
          continue;
        }

        return;
      }

      const entityBoundary = new Shape(positionedVertices).bounds.vertices;
      const isInBoundaries = 
        entityBoundary[1].x > lightBounds.vertices[0].x && 
        entityBoundary[0].x < lightBounds.vertices[1].x && 
        entityBoundary[0].y > lightBounds.vertices[3].y && 
        entityBoundary[3].y < lightBounds.vertices[0].y;
      
      if (!isInBoundaries) {
        continue;
      }

      for (const segment of positionedSegments) {
        entitySegments.push(segment);
        checkpointVertices.push(segment[0]);
        addSegmentVertices(segment, ...segment);
      }
    }
    
    const segments: Segment[] = [...lightBounds.segments, ...entitySegments];
    const segmentToBoundaryIntersections = new Map<Vector, Segment>();

    for (let i = 0; i < entitySegments.length; i++) {
      for (let j = 0; j < lightBounds.segments.length; j++) {
        const intersection = segmentWithSegmentIntersection(entitySegments[i], lightBounds.segments[j]);
        if (intersection) {
          checkpointVertices.push(intersection);
          segmentToBoundaryIntersections.set(intersection, entitySegments[i]);

          addSegmentVertices(entitySegments[i], intersection);
          addSegmentVertices(lightBounds.segments[j], intersection);
        }
      }
    }

    const segmentOverlappingVertices: Vector[] = []
    for (let i = 0; i < entitySegments.length; i++) {
      for (let j = i + 1; j < entitySegments.length; j++) {
        if (entitySegments[i].includes(entitySegments[j][0]) || entitySegments[i].includes(entitySegments[j][1])) {
          continue;
        }

        const intersection = segmentWithSegmentIntersection(entitySegments[i], entitySegments[j]);
        if (intersection) {
          segmentOverlappingVertices.push(intersection);
          checkpointVertices.push(intersection);

          addSegmentVertices(entitySegments[i], intersection);
          addSegmentVertices(entitySegments[j], intersection);
        }
      }
    }

    for (const vertex of checkpointVertices) {
      const relativeVertexPosition = vertex.subtract(this.transform.position); // Not normalized for precision safety
      const exposedRayCollision = new Ray(this.transform.position, relativeVertexPosition).cast(segments)!;
      
      if (!exposedRayCollision.intersectionPosition.isAlmostEqual(vertex, this.raycastInaccuracy)) {
        continue;
      }

      if (
        lightBounds.vertices.includes(vertex) ||
        segmentToBoundaryIntersections.has(vertex) ||
        segmentOverlappingVertices.includes(vertex)
      ) {
        raycastCheckpoints.push({
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

      const secondaryRayCollision = new Ray(vertex, relativeVertexPosition)
        .cast(segments.filter(segment => !segmentsConnectedToTargetVertex.includes(segment)));

      if (!secondaryRayCollision) {
        throw new Error('Area light endpoint ray did not overlap with its boundary box.');
      }

      const secondaryRayDifferenceSize = secondaryRayCollision.intersectionPosition.subtract(vertex);
      const secondaryRayDifferenceCenter = vertex.add(secondaryRayDifferenceSize.divide(2));
      const researchResolution = new Ray(secondaryRayDifferenceCenter, Vector.right).research(entitySegments);

      if (researchResolution.length % 2 === 0) {
        raycastCheckpoints.push({
          exposed: vertex,
          endpoint: secondaryRayCollision.intersectionPosition,
          endpointSegment: secondaryRayCollision.segment,
        })
  
        addSegmentVertices(secondaryRayCollision.segment, secondaryRayCollision.intersectionPosition);
      } else {
        raycastCheckpoints.push({
          exposed: vertex,
        })
      }
    }
    
    const maskPath: Set<Vector> = new Set();
    raycastCheckpoints.sort((a, b) => circluarVectorComparison(a.exposed.subtract(this.transform.position), b.exposed.subtract(this.transform.position)))

    for (let i = 0; i < raycastCheckpoints.length; i++) {
      const segmentInfo = raycastCheckpoints[i];
      const previousIndex = i === 0 ? raycastCheckpoints.length - 1 : i - 1;
      const previousSegmentInfo = raycastCheckpoints[previousIndex];

      if (verticesShareSegment(segmentInfo.exposed, previousSegmentInfo.exposed)) {
        maskPath.add(previousSegmentInfo.exposed);
        maskPath.add(segmentInfo.exposed);
        if (segmentInfo.endpoint) {
          maskPath.add(segmentInfo.endpoint);
        }
        continue;
      }

      if (segmentInfo.endpoint && previousSegmentInfo.endpoint && verticesShareSegment(segmentInfo.endpoint, previousSegmentInfo.endpoint)) {
        maskPath.add(previousSegmentInfo.endpoint);
        maskPath.add(segmentInfo.endpoint);
        maskPath.add(segmentInfo.exposed);
        continue;
      }

      if (segmentInfo.endpoint && verticesShareSegment(segmentInfo.endpoint, previousSegmentInfo.exposed)) {
        maskPath.add(previousSegmentInfo.exposed);
        maskPath.add(segmentInfo.endpoint);
        maskPath.add(segmentInfo.exposed);
        continue;
      }

      if (previousSegmentInfo.endpoint && verticesShareSegment(previousSegmentInfo.endpoint, segmentInfo.exposed)) {
        maskPath.add(previousSegmentInfo.endpoint);
        maskPath.add(segmentInfo.exposed);
        if (segmentInfo.endpoint) {
          maskPath.add(segmentInfo.endpoint);
        }
      }
    }

    return {
      lightBounds,
      checkpointVertices,
      raycastCheckpoints,
      segmentOverlappingVertices,
      maskPath,
    };
  }
}