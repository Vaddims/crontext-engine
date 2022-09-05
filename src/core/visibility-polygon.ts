import { Ray } from "./ray";
import { Shape } from "./shape";
import { Vector } from "./vector";

export interface StableCheckpointRaycast {
  readonly exposed: Vector;
}

export interface ReflectiveCheckpointRaycast extends StableCheckpointRaycast {
  readonly endpoint: Vector;
  readonly endpointSegment: Shape.Segment;
}

export type CheckpointRaycast = StableCheckpointRaycast & Partial<ReflectiveCheckpointRaycast>;
export type VisibilityPolygonSegmentShareMap = InstanceType<typeof VisibilityPolygon.SegmentShareMap>;

export interface CheckpointRaycastCreationOptions {
  readonly segmentShareMap: VisibilityPolygonSegmentShareMap;
  readonly checkpointVertices: Vector[];
  readonly entityShapes: Shape[];
  readonly fulcrum: Vector;
  readonly shapes: Shape[];

  readonly lightBounds?: Shape;
  readonly shapeInterimVertices?: Vector[];
  readonly lightBoundsInterimVertices?: Vector[];
}

export interface VisibilityPolygonCreationOptions {
  readonly fulcrum: Vector;
  readonly obsticles: Shape[];
  readonly skipObsticleCulling?: boolean;
  readonly externalMasks: Shape[] & { readonly 0: Shape };
}

export interface VisibilityPolygonPanoramaCreationOptions extends VisibilityPolygonCreationOptions {

}

export interface VisibilityPolygonSectorOptions extends VisibilityPolygonCreationOptions {
  readonly direction: Vector;
  readonly angle: number;
  readonly nearPlane: number;
}

export class VisibilityPolygon {
  public readonly fulcrum: Vector;
  public readonly segmentShareMap: VisibilityPolygonSegmentShareMap;

  public readonly externalMaskBounds: Shape;
  public readonly visibleObsticles: Shape[];
  public readonly visibleObsticleSegments: Shape.Segment[]; 
  public readonly checkpointVertices: Vector[] = []; // Needed directly definition from outside (effect)
  public readonly checkpointRaycasts: CheckpointRaycast[] = [];
  public readonly path: Vector[] = [];

  public readonly obsticlesWithBoundsIntersections: Shape.SegmentIntersection[];
  public readonly obsticlesWithBoundsInterimVertices: Vector[];

  public readonly obsticlesWithObsticlesIntersections: Shape.SegmentIntersection[] = [];
  public readonly obsticlesWithObsticlesInterimVertices: Vector[];

  public readonly intersections: Shape.SegmentIntersection[] = [];

  protected constructor(options: VisibilityPolygonCreationOptions) {
    const { fulcrum, obsticles, skipObsticleCulling, externalMasks } = options;
    
    this.fulcrum = fulcrum;
    this.externalMaskBounds = externalMasks[0]; // TODO Rework with multiple masks
    
    this.visibleObsticles = !skipObsticleCulling ?
      VisibilityPolygon.obsticleCulling(obsticles, this.externalMaskBounds) :
      [...obsticles];
    
    this.visibleObsticleSegments = Shape.segmentCluster(this.visibleObsticles);
    
    this.segmentShareMap = new VisibilityPolygon.SegmentShareMap(...this.visibleObsticleSegments, ...this.externalMaskBounds.segments);
    
    // Bound calculations
    this.obsticlesWithBoundsIntersections = this.visibleObsticles.map(obsticle => Shape.segmentIntersections(this.externalMaskBounds, obsticle)).flat();
    this.obsticlesWithBoundsInterimVertices = this.obsticlesWithBoundsIntersections.map(intersection => intersection.position);
    
    for (let i = 0; i < this.visibleObsticles.length; i++) {
      for (let j = i + 1; j < this.visibleObsticles.length; j++) {
        const intersection = Shape.segmentIntersections(this.visibleObsticles[i], this.visibleObsticles[j]);
        if (!intersection) {
          continue;
        }
        
        this.obsticlesWithObsticlesIntersections.push(...intersection);
      }
    }
    this.obsticlesWithObsticlesInterimVertices = this.obsticlesWithObsticlesIntersections.map(intersection => intersection.position);

    this.intersections = [...this.obsticlesWithBoundsIntersections, ...this.obsticlesWithObsticlesIntersections];
    for (const intersection of this.intersections) {
      this.segmentShareMap.addHolders(intersection.position, intersection.segmentHolders);
    }
  }

  public [Symbol.iterator]() {
    return this.path;
  }

  private cachedShape: Shape | null = null;
  public get shape() {
    if (this.cachedShape) {
      return this.cachedShape;
    }

    return this.cachedShape = new Shape(this.path);
  }

  private createRaycastCheckpoint(checkpointVertex: Vector, shapes: Shape[]) {
    const relativeCheckpointVertexPosition = checkpointVertex.subtract(this.fulcrum);
    const exposedRayResolution = new Ray(this.fulcrum, relativeCheckpointVertexPosition).cast(shapes);

    if (!exposedRayResolution?.intersectionPosition.isAlmostEqual(checkpointVertex)) {
      return; // The ray hitted something before the target checkpoint vertex
    }

    if (
      this.externalMaskBounds.vertices.includes(checkpointVertex) ||
      this.obsticlesWithObsticlesInterimVertices.includes(checkpointVertex) ||
      this.obsticlesWithBoundsInterimVertices.includes(checkpointVertex)
    ) {
      const stableRaycastCheckpoint = VisibilityPolygon.createStableRaycastCheckpoint(checkpointVertex);
      return stableRaycastCheckpoint;
    }

    const checkpointVertexSegments: Shape.Segment[] = [];
    for (const [segment, segmentVertices] of this.segmentShareMap) {
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
      console.error(new Error(`Endpoint ray did not overlap with any shape or light source bounds`));
      return;
    }

    const endpointRayCastDistance = endpointRayResolution.intersectionPosition.subtract(checkpointVertex);
    const relativeEndpointRayCastCenter = checkpointVertex.add(endpointRayCastDistance.divide(2));

    const openStackEscape = Ray.escape(relativeEndpointRayCastCenter).researchOpenStacks(this.visibleObsticles);
    const shapesOverlapEndpointRaycastCenter = openStackEscape.size > 0;

    if (shapesOverlapEndpointRaycastCenter) {
      const stableRaycastCheckpoint = VisibilityPolygon.createStableRaycastCheckpoint(checkpointVertex);
      return stableRaycastCheckpoint;
    }

    const { intersectionPosition, segment } = endpointRayResolution;
    const reflectiveRaycastCheckpoint = VisibilityPolygon.createReflectiveRaycastCheckpoint(checkpointVertex, intersectionPosition, segment);
    return reflectiveRaycastCheckpoint;
  }

  protected registerRaycastCheckpoints(shapes: Shape[]) {
    for (const checkpointVertex of this.checkpointVertices) {
      const raycastCheckpoint = this.createRaycastCheckpoint(checkpointVertex, shapes);
      if (raycastCheckpoint) {
        this.checkpointRaycasts.push(raycastCheckpoint);
      }
    }
  }

  protected establishExposedConnection(currentCheckpointRaycast: CheckpointRaycast, previousCheckpointRaycast: CheckpointRaycast) {
    const { segmentShareMap, path } = this;
    if (segmentShareMap.verticesShareSegment(currentCheckpointRaycast.exposed, previousCheckpointRaycast.exposed)) {
      path.push(currentCheckpointRaycast.exposed);
      if (currentCheckpointRaycast.endpoint) {
        path.push(currentCheckpointRaycast.endpoint);
      }

      return true;
    }

    return false;
  }

  protected establishEndpointConnection(currentCheckpointRaycast: CheckpointRaycast, previousCheckpointRaycast: CheckpointRaycast) {
    const { segmentShareMap, path } = this;

    if (
      currentCheckpointRaycast.endpoint &&
      previousCheckpointRaycast.endpoint &&
      segmentShareMap.verticesShareSegment(currentCheckpointRaycast.endpoint, previousCheckpointRaycast.endpoint)
    ) {
      path.push(currentCheckpointRaycast.endpoint, currentCheckpointRaycast.exposed);
      return true;
    }
    
    return false;
  }

  protected establishIncreasingConnection(currentCheckpointRaycast: CheckpointRaycast, previousCheckpointRaycast: CheckpointRaycast) {
    const { segmentShareMap, path } = this;

    if (
      currentCheckpointRaycast.endpoint &&
      segmentShareMap.verticesShareSegment(currentCheckpointRaycast.endpoint, previousCheckpointRaycast.exposed)
    ) {
      path.push(currentCheckpointRaycast.endpoint, currentCheckpointRaycast.exposed);
      return true;
    }

    return false;
  }

  protected establishDecreasingConnection(currentCheckpointRaycast: CheckpointRaycast, previousCheckpointRaycast: CheckpointRaycast) {
    const { segmentShareMap, path } = this;

    if (
      previousCheckpointRaycast.endpoint &&
      segmentShareMap.verticesShareSegment(currentCheckpointRaycast.exposed, previousCheckpointRaycast.endpoint)
    ) {
      path.push(currentCheckpointRaycast.exposed);
      if (currentCheckpointRaycast.endpoint) {
        path.push(currentCheckpointRaycast.endpoint);
      }

      return true;
    }

    return false;
  }

  protected establishUniversalConnection(currentCheckpointRaycast: CheckpointRaycast, previousCheckpointRaycast: CheckpointRaycast) {
    return (
      this.establishExposedConnection(currentCheckpointRaycast, previousCheckpointRaycast) ||
      this.establishEndpointConnection(currentCheckpointRaycast, previousCheckpointRaycast) ||
      this.establishIncreasingConnection(currentCheckpointRaycast, previousCheckpointRaycast) ||
      this.establishDecreasingConnection(currentCheckpointRaycast, previousCheckpointRaycast)
    );
  }

  public static obsticleCulling(obsticles: Shape[], maskBounds: Shape) {
    return obsticles.filter((obsticle) => maskBounds.overlaps(obsticle));
  }

  public static getOverlapsShape(fulcrum: Vector, shapes: Shape[]) {
    const escapeRay = Ray.escape(fulcrum);
    const escapeRayOpenStack = escapeRay.researchOpenStacks(shapes);
    return escapeRayOpenStack.size !== 0;
  }

  // private static bounds(fulcrum: Vector, range: number) {
  //   const scale = Vector.one.multiply(range);
  //   const boundsTransform = Transform.setScale(scale).setPosition(fulcrum);
  //   return new Rectangle().withTransform(boundsTransform);
  // }

  public static SegmentShareMap = class VisibilityPolygonSegmentShareMap extends Map<Shape.Segment, Vector[]> {
    constructor(...segments: Shape.Segment[]) {
      super(segments.map((segment => [segment, [...segment]])))
    }

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

    addHolders(vertex: Vector, holders: Shape.SegmentIntersection['segmentHolders']) {
      for (const holder of holders) {
        this.add(holder, vertex);
      }
      
      return this;
    }

    verticesShareSegment(a: Vector, b: Vector) {
      return Array.from(this.values()).some(vertices => vertices.includes(a) && vertices.includes(b));
    }
  }

  private static createStableRaycastCheckpoint(exposed: Vector): StableCheckpointRaycast {
    return { exposed };
  }

  protected static createReflectiveRaycastCheckpoint(exposed: Vector, endpoint: Vector, endpointSegment: Shape.Segment) {
    return { exposed, endpoint, endpointSegment };
  }
}
