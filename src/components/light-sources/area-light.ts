import { Color, Entity, Ray, Scene, Segment, Shape, Vector } from "../../core";
import { Gizmos } from "../../core/gizmos";
import { SimulationRenderingPipeline } from "../../rendering-pipelines";
import { Rectangle } from "../../shapes";
import { lineWithLineIntersection, rotatedOffsetPosition, segmentWithSegmentIntersection } from "../../utils";
import { LightSource } from "../light";

interface SegmentInfo {
  exposed: Vector,
  endpoint?: Vector,
  endpointSegment?: Segment,
}

function circluarVectorComparison(a: Vector, b: Vector) {
  return Math.atan2(a.x, a.y) > Math.atan2(b.x, b.y) ? 1 : -1;
}

export class AreaLight extends LightSource {
  public radius = 20;
  public usePhysicalRendering = true;

  render(renderer: SimulationRenderingPipeline) {
    const scene = this.entity.tryGetScene();
    if (!scene) {
      return;
    }

    const res = this.getv(scene);
    if (!res) {
      return;
    }

    const { vPath } = res;

    const { remove: removeMask } = renderer.createMask(vPath);
    renderer.renderRadialGradient(this.transform.position, this.radius, [{
      offset: 0,
      color: Color.white,
    }, {
      offset: 0.5,
      color: Color.transparent,
    }])
    removeMask()
  }

  gizmosRender(gizmos: Gizmos) {
    const res = this.getv(gizmos.currentScene);

    if (!res) {
      return;
    }

    const {
      segmentStack,
      vPath,
      verts,
      vertices
    } = res;
    
    const lineColor = new Color(0, 0, 255, 0.4);
    const vertexColor = Color.blue;
    const vertexHighlightRadius = 0.1

    for (let i = 0; i < segmentStack.length; i++) {
      const segmentInfo = segmentStack[i];
      gizmos.renderLine(this.transform.position, segmentInfo.exposed, lineColor)
      gizmos.renderFixedDisk(segmentInfo.exposed, vertexHighlightRadius, vertexColor);
      if (segmentInfo.endpoint) {
        gizmos.renderLine(segmentInfo.exposed, segmentInfo.endpoint, lineColor)
        gizmos.renderFixedDisk(segmentInfo.endpoint, vertexHighlightRadius, vertexColor);
      }
    }

    gizmos.highlightVertices(vPath, Color.blue);
    for (const vertex of verts) {
      gizmos.renderFixedCircle(vertex, 0.1, Color.yellow);
    }

    for (const vertex of vertices) {
      gizmos.renderFixedCircle(vertex, 0.1, Color.green);
    }
  }

  getv(scene: Scene) {
    const segmentVertices = new Map<Segment, Vector[]>();
    const addSegmentVertices = (segment: Segment, ...additionalVertices: Vector[]) => {
      const vertices = segmentVertices.get(segment);
      if (!vertices) {
        segmentVertices.set(segment, additionalVertices);
        return;
      }

      vertices.push(...additionalVertices);
    }

    const boundary = new Rectangle().withScale(this.radius).withOffset(this.transform.position);
    const boundaryVertices = boundary.vertices;
    const boundarySegments = boundary.getSegments();
    for (const boundarySegment of boundarySegments) {
      addSegmentVertices(boundarySegment, ...boundarySegment);
    }

    const entitySegments: Segment[] = [];
    const segments: Segment[] = [...boundarySegments]
    const vertices: Vector[] = [...boundaryVertices];
    const segmentStack: SegmentInfo[] = [];

    const verticesShareSegment = (vertex1: Vector, vertex2: Vector) => {
      for (const vertices of segmentVertices.values()) {
        if (vertices.includes(vertex1) && vertices.includes(vertex2)) {
          return true;
        }
      }

      return false;
    }
    
    for (const entity of scene.getAllEntities()) {
      if (entity === this.entity) {
        continue;
      }

      const componentInstance = entity.components.find(this.physicalRenderingDependence);
      if (!componentInstance) {
        continue;
      }

      const positionedVertices = componentInstance.relativeVerticesPosition();
      const positionedSegments = new Shape(positionedVertices).getSegments();
      const entityBoundary = new Shape(positionedVertices).getBoundaryRectangle().vertices;
      const isInBoundaries = entityBoundary[1].x > boundaryVertices[0].x && entityBoundary[0].x < boundaryVertices[1].x && entityBoundary[0].y > boundaryVertices[3].y && entityBoundary[3].y < boundaryVertices[0].y;
      if (isInBoundaries) {
        for (const segment of positionedSegments) {
          vertices.push(...segment);
          entitySegments.push(segment);
          addSegmentVertices(segment, ...segment);
        }
      }
    }

    segments.push(...entitySegments);

    if (Ray.isPointInside(scene, this.transform.position)) {
      return;
    }

    const entityBoundaryInteractions = new Map<Vector, Segment>();
    for (let i = 0; i < entitySegments.length; i++) {
      for (let j = 0; j < boundarySegments.length; j++) {
        const intersection = segmentWithSegmentIntersection(entitySegments[i], boundarySegments[j]);
        if (intersection) {
          vertices.push(intersection);
          entityBoundaryInteractions.set(intersection, entitySegments[i]);

          addSegmentVertices(entitySegments[i], intersection);
          addSegmentVertices(boundarySegments[j], intersection);
        }
      }
    }

    const verts: Vector[] = []
    for (let i = 0; i < entitySegments.length - 1; i++) {
      for (let j = i + 1; j < entitySegments.length; j++) {
        const intersection = segmentWithSegmentIntersection(entitySegments[i], entitySegments[j]);
        if (intersection) {
          verts.push(intersection);

          addSegmentVertices(entitySegments[i], intersection);
          addSegmentVertices(entitySegments[j], intersection);
        }
      }
    }

    vertices.push(...verts);

    for (const vertex of vertices) {
      const direction = vertex.subtract(this.transform.position).normalized;
      const exposedRayCollision = new Ray(this.transform.position, direction).cast(segments);
      
      if (!exposedRayCollision) { // The trace is in the boundary angle (It passes through it beacause of the precition)
        segmentStack.push({
          exposed: vertex,
        })

        continue;
      }
      
      const rayAproxRange = 0.0001;
      if (exposedRayCollision.intersectionPosition.isAlmostEqual(vertex, rayAproxRange)) {
        if (
          boundarySegments.includes(exposedRayCollision.segment) || 
          boundaryVertices.includes(vertex) ||
          entityBoundaryInteractions.has(vertex) ||
          verts.includes(vertex)
        ) {
          segmentStack.push({
            exposed: vertex,
          });

          continue;
        }

        // gizmos.renderCircle(vertex, rayAproxRange, Color.red);
        const secondaryRayCollision = new Ray(vertex, direction).cast(segments);
        if (!secondaryRayCollision) {
          console.log('secondaryRay didnt hit anything')
          continue;
        }

        const secondaryRayDifferenceSize = secondaryRayCollision.intersectionPosition.subtract(vertex);
        const secondaryRayDifferenceCenter = vertex.add(secondaryRayDifferenceSize.divide(2));
        const researchResolution = new Ray(secondaryRayDifferenceCenter, Vector.right).research(entitySegments);

        if (researchResolution.length % 2 === 0) {
          segmentStack.push({
            exposed: vertex,
            endpoint: secondaryRayCollision.intersectionPosition,
            endpointSegment: secondaryRayCollision.segment,
          })

          addSegmentVertices(secondaryRayCollision.segment, secondaryRayCollision.intersectionPosition);
        } else {
          segmentStack.push({
            exposed: vertex,
          })
        }

        continue;
      }

      const vertexDistance = Vector.distance(this.transform.position, vertex);
      const endpointVertexDistance = Vector.distance(this.transform.position, exposedRayCollision.intersectionPosition);
      if (vertexDistance < endpointVertexDistance) {
        const rayDifferenceSize = exposedRayCollision.intersectionPosition.subtract(vertex);
        const rayDifferenceCenter = vertex.add(rayDifferenceSize.divide(2));
        const researchResolution = new Ray(rayDifferenceCenter, Vector.right).research(entitySegments);

        if (researchResolution.length % 2 === 0) {
          segmentStack.push({
            exposed: vertex,
            endpoint: exposedRayCollision.intersectionPosition,
            endpointSegment: exposedRayCollision.segment,
          })
          addSegmentVertices(exposedRayCollision.segment, exposedRayCollision.intersectionPosition);
        } else {
          segmentStack.push({
            exposed: vertex,
          })
        }
        continue;
      }
    }

    const vPath: Vector[] = [];
    segmentStack.sort((a, b) => circluarVectorComparison(a.exposed.subtract(this.transform.position), b.exposed.subtract(this.transform.position)))

    for (let i = 0; i < segmentStack.length; i++) {
      const segmentInfo = segmentStack[i];
      const previousIndex = i === 0 ? segmentStack.length - 1 : i - 1;
      const previousSegmentInfo = segmentStack[previousIndex];

      if (verticesShareSegment(segmentInfo.exposed, previousSegmentInfo.exposed)) {
        vPath.push(previousSegmentInfo.exposed);
        vPath.push(segmentInfo.exposed);
        if (segmentInfo.endpoint) {
          vPath.push(segmentInfo.endpoint);
        }
        continue;
      }

      if (segmentInfo.endpoint && previousSegmentInfo.endpoint && verticesShareSegment(segmentInfo.endpoint, previousSegmentInfo.endpoint)) {
        vPath.push(previousSegmentInfo.endpoint);
        vPath.push(segmentInfo.endpoint);
        vPath.push(segmentInfo.exposed);
        continue;
      }

      if (segmentInfo.endpoint && verticesShareSegment(segmentInfo.endpoint, previousSegmentInfo.exposed)) {
        vPath.push(previousSegmentInfo.exposed);
        vPath.push(segmentInfo.endpoint);
        vPath.push(segmentInfo.exposed);
        continue;
      }

      if (previousSegmentInfo.endpoint && verticesShareSegment(previousSegmentInfo.endpoint, segmentInfo.exposed)) {
        vPath.push(previousSegmentInfo.endpoint);
        vPath.push(segmentInfo.exposed);
        if (segmentInfo.endpoint) {
          vPath.push(segmentInfo.endpoint);
        }
      }
    }


    return {
      segmentVertices,
      boundaryVertices,
      boundarySegments,
      entitySegments,
      segments,
      vertices,
      segmentStack,
      entityBoundaryInteractions,
      vPath,
      verts,
    };
  }
}