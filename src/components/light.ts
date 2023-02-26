import { Component, ComponentConstructor, Ray, Renderer, Shape, Vector } from "../core";
import { VisibilityPolygon } from "../core/visibility-polygon";
import { SimulationRenderingPipeline } from "../rendering-pipelines";
import { Collider } from "./collider";
import { MeshRenderer } from "./mesh-renderer";

export interface StableCheckpointRaycast {
  readonly exposed: Vector;
}

export interface ReflectiveCheckpointRaycast extends StableCheckpointRaycast {
  readonly endpoint: Vector;
  readonly endpointSegment: Shape.Segment;
}

export type CheckpointRaycast = StableCheckpointRaycast & Partial<ReflectiveCheckpointRaycast>;

export interface CheckpointRaycastCreationOptions {
  readonly segmentShareMap: LightSourceSegmentShareMap;
  readonly checkpointVertices: Vector[];
  readonly entityShapes: Shape[];
  readonly fulcrum: Vector;
  readonly shapes: Shape[];

  readonly shapeInterimVertices?: Vector[];
  readonly lightBounds?: Shape;
  readonly lightBoundsInterimVertices?: Vector[];
}

export interface LightSource {
  render(renderer: SimulationRenderingPipeline): void;
}

class LightSourceSegmentShareMap extends Map {
  add(segment: Shape.Segment, ...vertices: Vector[]) {
    const requiredVertices = vertices.length === 0 ? [...segment] : vertices; 
    const existingVertices = this.get(segment);

    if (existingVertices) {
      existingVertices.push(...requiredVertices);
    } else {
      this.set(segment, [...requiredVertices]);
    }

    return this;
  }

  verticesShareSegment(a: Vector, b: Vector) {
    return Array.from(this.values()).some(vertices => vertices.includes(a) && vertices.includes(b));
  }
}

export class LightSource extends Component {
  public usePhysicalRendering = true; // Rendering with shadow casts
  public physicalRenderingDependence: ComponentConstructor<MeshRenderer> | ComponentConstructor<Collider> = MeshRenderer;
  public visibilityPolygonCache: VisibilityPolygon | null = null;

  public static createStableRaycastCheckpoint(exposed: Vector): StableCheckpointRaycast {
    return { exposed };
  }

  public static createReflectiveRaycastCheckpoint(exposed: Vector, endpoint: Vector, endpointSegment: Shape.Segment) {
    return { exposed, endpoint, endpointSegment };
  }
  
  public static createRaycastCheckpoints(options: CheckpointRaycastCreationOptions) {
    const { 
      checkpointVertices, 
      fulcrum, 
      shapes, 
      lightBounds, 
      lightBoundsInterimVertices, 
      shapeInterimVertices, 
      segmentShareMap,
      entityShapes
    } = options;

    const checkpointRaycasts: CheckpointRaycast[] = [];
    for (const checkpointVertex of checkpointVertices) {
      const relativeCheckpointVertexPosition = checkpointVertex.subtract(fulcrum);
      const exposedRayResolution = new Ray(fulcrum, relativeCheckpointVertexPosition).cast(shapes);

      if (!exposedRayResolution?.intersectionPosition.isAlmostEqual(checkpointVertex)) {
        continue; // The ray hitted something before the target checkpoint vertex
      }

      if (
        shapeInterimVertices?.includes(checkpointVertex) ||
        lightBounds?.vertices.includes(checkpointVertex) ||
        lightBoundsInterimVertices?.includes(checkpointVertex)
      ) {
        checkpointRaycasts.push(LightSource.createStableRaycastCheckpoint(checkpointVertex));
        continue;
      }

      const checkpointVertexSegments: Shape.Segment[] = [];
      for (const [segment, segmentVertices] of segmentShareMap) {
        if (segmentVertices.includes(checkpointVertex)) {
          checkpointVertexSegments.push(segment);
        }

        if (checkpointVertexSegments.length === 2) {
          break;
        }
      }

      const endpointRay = new Ray(checkpointVertex, relativeCheckpointVertexPosition.normalized);
      const endpointRayResolution = endpointRay.cast(shapes, { segmentMask: checkpointVertexSegments });

      if (!endpointRayResolution) {
        throw new Error(`Endpoint ray did not overlap with any shape or light source bounds`);
      }

      const endpointRayCastDistance = endpointRayResolution.intersectionPosition.subtract(checkpointVertex);
      const relativeEndpointRayCastCenter = checkpointVertex.add(endpointRayCastDistance.divide(2));

      const openStackEscape = Ray.escape(relativeEndpointRayCastCenter).researchOpenStacks(entityShapes);
      const shapesOverlapEndpointRaycastCenter = openStackEscape.size > 0;

      if (shapesOverlapEndpointRaycastCenter) {
        checkpointRaycasts.push(LightSource.createStableRaycastCheckpoint(checkpointVertex));
        continue;
      }

      const { intersectionPosition, segment } = endpointRayResolution;
      const reflectiveRaycastCheckpoint = LightSource.createReflectiveRaycastCheckpoint(checkpointVertex, intersectionPosition, segment);
      checkpointRaycasts.push(reflectiveRaycastCheckpoint);
    }

    return checkpointRaycasts;
  }

  public update() {
    this.visibilityPolygonCache = null;
  }
}