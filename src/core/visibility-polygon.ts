import { LightSource } from "../components";
import { Rectangle } from "../shapes";
import { Ray, ShapeRayResolution } from "./ray";
import { Scene } from "./scene";
import { Shape } from "./shape";
import { Transform } from "./transform";
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
export type VisibilityPolygonPathCreator = InstanceType<typeof VisibilityPolygon.PathCreator>;

export interface CheckpointRaycastCreationOptions {
  readonly segmentShareMap: VisibilityPolygonSegmentShareMap;
  readonly checkpointVertices: Vector[];
  readonly entityShapes: Shape[];
  readonly fulcrum: Vector;
  readonly shapes: Shape[];

  readonly shapeInterimVertices?: Vector[];
  readonly lightBounds?: Shape;
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

const boundsOverlaping = (a: Shape, b: Shape) => {
  const av = a.vertices;
  const bv = b.vertices;

  return av[1].x > bv[0].x && av[0].x < bv[1].x && av[0].y > bv[3].y && av[3].y < bv[0].y;
}

export class VisibilityPolygon {
  public readonly fulcrum: Vector;
  public readonly segmentShareMap: VisibilityPolygonSegmentShareMap;
  public readonly pathCreator: VisibilityPolygonPathCreator;

  public readonly externalMaskBounds: Shape;
  public readonly visibleObsticles: Shape[];
  public readonly visibleObsticleSegments: Shape.Segment[]; 
  public readonly checkpointVertices: Vector[] = []; // Needed directly definition from outside (effect)
  public readonly checkpointRaycasts: CheckpointRaycast[] = [];

  public readonly obsticlesWithBoundsIntersections: Shape.SegmentIntersection[];
  public readonly obsticlesWithBoundsInterimVertices: Vector[];

  public readonly obsticlesWithObsticlesIntersections: Shape.SegmentIntersection[] = [];
  public readonly obsticlesWithObsticlesInterimVertices: Vector[];

  public readonly intersections: Shape.SegmentIntersection[] = [];

  private constructor(options: VisibilityPolygonCreationOptions) {
    const { fulcrum, obsticles, skipObsticleCulling, externalMasks } = options;
    
    this.fulcrum = fulcrum;
    this.externalMaskBounds = externalMasks[0]; // TODO Rework with multiple masks
    
    this.visibleObsticles = !skipObsticleCulling ?
      VisibilityPolygon.obsticleCulling(obsticles, this.externalMaskBounds) :
      [...obsticles];
    
    this.visibleObsticleSegments = Shape.segmentCluster(this.visibleObsticles);
    
    this.segmentShareMap = new VisibilityPolygon.SegmentShareMap(...this.visibleObsticleSegments, ...this.externalMaskBounds.segments);
    this.pathCreator = new VisibilityPolygon.PathCreator(this.segmentShareMap);
    
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

  public static createPanorama(options: VisibilityPolygonPanoramaCreationOptions) {
    const {} = options;

    const visibilityPolygon = new VisibilityPolygon(options);

    visibilityPolygon.checkpointVertices.push(
      ...Shape.vertexCluster(visibilityPolygon.visibleObsticles),
      ...visibilityPolygon.obsticlesWithObsticlesInterimVertices,
      ...visibilityPolygon.obsticlesWithBoundsInterimVertices,
      ...visibilityPolygon.externalMaskBounds.vertices,
    );

    const shapes = [visibilityPolygon.externalMaskBounds, ...visibilityPolygon.visibleObsticles];
    visibilityPolygon.registerRaycastCheckpoints(shapes);

    for (const checkpointRaycast of visibilityPolygon.checkpointRaycasts) {
      const { endpoint, endpointSegment } = checkpointRaycast;
      if (endpoint && endpointSegment) {
        visibilityPolygon.segmentShareMap.add(endpointSegment, endpoint)
      }
    }

    const relativeCheckpointRotation = (vertex: Vector) => vertex.subtract(visibilityPolygon.fulcrum).rotation();
    const positiveRotationComparison = (a: CheckpointRaycast, b: CheckpointRaycast) => (
      relativeCheckpointRotation(a.exposed) - relativeCheckpointRotation(b.exposed)
    )
    
    visibilityPolygon.checkpointRaycasts.sort(positiveRotationComparison);

    for (let i = 0; i < visibilityPolygon.checkpointRaycasts.length; i++) {
      const currentCheckpointRaycast = visibilityPolygon.checkpointRaycasts[i];
      const previousCheckpointRaycast = visibilityPolygon.checkpointRaycasts.at(i - 1);

      if (!previousCheckpointRaycast) {
        throw new Error(`previousCheckpointRaycast doesn't exist`);
      }

      if (visibilityPolygon.pathCreator.exposedConnection(currentCheckpointRaycast, previousCheckpointRaycast)) {
        continue;
      }

      if (visibilityPolygon.pathCreator.endpointConnection(currentCheckpointRaycast, previousCheckpointRaycast)) {
        continue;
      }

      if (visibilityPolygon.pathCreator.increasingConnection(currentCheckpointRaycast, previousCheckpointRaycast)) {
        continue;
      }

      if (visibilityPolygon.pathCreator.decreasingConnection(currentCheckpointRaycast, previousCheckpointRaycast)) {
        continue;
      }
    }

    return visibilityPolygon;
  }

  public static createSector(options: VisibilityPolygonSectorOptions) {
    const { fulcrum, direction, angle, nearPlane } = options;

    const visibilityPolygon = new VisibilityPolygon(options);

    const normalizeRotation = (angle: number) => (angle >= 0 ? angle : angle + Math.PI * 2) % (Math.PI * 2);

    const basisAngle = normalizeRotation(direction.rotation() % (Math.PI * 2));

    
    visibilityPolygon.checkpointVertices.push(
      ...Shape.vertexCluster(visibilityPolygon.visibleObsticles),
      ...visibilityPolygon.obsticlesWithObsticlesInterimVertices,
      ...visibilityPolygon.obsticlesWithBoundsInterimVertices,
      ...visibilityPolygon.externalMaskBounds.vertices,
    );
      
    const shapes = [visibilityPolygon.externalMaskBounds, ...visibilityPolygon.visibleObsticles];
    visibilityPolygon.registerRaycastCheckpoints(shapes);
      
    const createLimiterReflectiveCheckpoint = (angle: number) => {
      const resolution = new Ray(fulcrum, Vector.fromAngle(angle)).cast(shapes)!;
      return VisibilityPolygon.createReflectiveRaycastCheckpoint(
        resolution.direction.normalized.multiply(nearPlane).add(fulcrum),
        resolution.intersectionPosition,
        resolution.segment,
      );
    };
        
    const angleDifference = angle / 2;
    const negativeAngle = normalizeRotation(basisAngle - angleDifference);
    const positiveAngle = normalizeRotation(basisAngle + angleDifference);
    const negativeRaycastCheckpoint = createLimiterReflectiveCheckpoint(negativeAngle);
    const positiveRaycastCheckpoint = createLimiterReflectiveCheckpoint(positiveAngle);

    visibilityPolygon.checkpointRaycasts.push(negativeRaycastCheckpoint, positiveRaycastCheckpoint);

    for (const checkpointRaycast of visibilityPolygon.checkpointRaycasts) {
      const { endpoint, endpointSegment } = checkpointRaycast;
      if (endpoint && endpointSegment) {
        visibilityPolygon.segmentShareMap.add(endpointSegment, endpoint)
      }
    }

    const sectorViewportCheckpointRaycasts = visibilityPolygon.checkpointRaycasts.filter(raycast => {
      if (raycast === negativeRaycastCheckpoint || raycast === positiveRaycastCheckpoint) {
        return true;
      }

      const rotation = raycast.exposed.subtract(fulcrum).rotation();
      if (negativeAngle <= positiveAngle) {
        return rotation >= negativeAngle && rotation <= positiveAngle;
      }

      return rotation >= negativeAngle || rotation <= positiveAngle;
    });

    const relativeCheckpointRotation = (vertex: Vector) => vertex.subtract(visibilityPolygon.fulcrum).rotation();
    const positiveRotationComparison = (a: CheckpointRaycast, b: CheckpointRaycast) => (
      relativeCheckpointRotation(a.endpoint ?? a.exposed) - relativeCheckpointRotation(b.endpoint ?? b.exposed)
    );
    
    visibilityPolygon.checkpointRaycasts.length = 0;
    visibilityPolygon.checkpointRaycasts.push(...sectorViewportCheckpointRaycasts);
    visibilityPolygon.checkpointRaycasts.sort(positiveRotationComparison);

    for (let i = 0; i < visibilityPolygon.checkpointRaycasts.length; i++) {
      const currentCheckpointRaycast = visibilityPolygon.checkpointRaycasts[i];
      const previousCheckpointRaycast = visibilityPolygon.checkpointRaycasts.at(i - 1);

      if (!previousCheckpointRaycast) {
        throw new Error(`previousCheckpointRaycast doesn't exist`);
      }

      if (currentCheckpointRaycast.exposed === negativeRaycastCheckpoint.exposed) {
        visibilityPolygon.pathCreator.path.push(currentCheckpointRaycast.exposed, currentCheckpointRaycast.endpoint!);
        continue;
      }

      if (currentCheckpointRaycast.exposed === positiveRaycastCheckpoint.exposed) {
        visibilityPolygon.pathCreator.path.push(currentCheckpointRaycast.endpoint!, currentCheckpointRaycast.exposed);
        continue;
      }

      if (visibilityPolygon.pathCreator.exposedConnection(currentCheckpointRaycast, previousCheckpointRaycast)) {
        continue;
      }

      if (visibilityPolygon.pathCreator.endpointConnection(currentCheckpointRaycast, previousCheckpointRaycast)) {
        continue;
      }

      if (visibilityPolygon.pathCreator.increasingConnection(currentCheckpointRaycast, previousCheckpointRaycast)) {
        continue;
      }

      if (visibilityPolygon.pathCreator.decreasingConnection(currentCheckpointRaycast, previousCheckpointRaycast)) {
        continue;
      }
    }

    return visibilityPolygon;
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

  private registerRaycastCheckpoints(shapes: Shape[]) {
    for (const checkpointVertex of this.checkpointVertices) {
      const raycastCheckpoint = this.createRaycastCheckpoint(checkpointVertex, shapes);
      if (raycastCheckpoint) {
        this.checkpointRaycasts.push(raycastCheckpoint);
      }
    }
  }

  public static obsticleCulling(obsticles: Shape[], maskBounds: Shape) {
    return obsticles.filter(maskBounds.overlaps);
  }

  public static getOverlapsShape(fulcrum: Vector, shapes: Shape[]) {
    const escapeRay = Ray.escape(fulcrum);
    const escapeRayOpenStack = escapeRay.researchOpenStacks(shapes);
    return escapeRayOpenStack.size !== 0;
  }

  private static bounds(fulcrum: Vector, range: number) {
    const scale = Vector.one.multiply(range);
    const boundsTransform = Transform.setScale(scale).setPosition(fulcrum);
    return new Rectangle().withTransform(boundsTransform);
  }

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

  public static PathCreator = class VisibilityPolygonPathCreator {
    public readonly path: Vector[] = [];

    public constructor(
      public readonly segmentShareMap: VisibilityPolygonSegmentShareMap, 
    ) {}

    public exposedConnection(currentCheckpointRaycast: CheckpointRaycast, previousCheckpointRaycast: CheckpointRaycast) {
      const { segmentShareMap, path } = this;
      if (segmentShareMap.verticesShareSegment(currentCheckpointRaycast.exposed, previousCheckpointRaycast.exposed)) {
        path.push(currentCheckpointRaycast.exposed);
        if (currentCheckpointRaycast.endpoint) {
          path.push(currentCheckpointRaycast.endpoint);
        }
        return true
      }

      return false;
    }

    public endpointConnection(currentCheckpointRaycast: CheckpointRaycast, previousCheckpointRaycast: CheckpointRaycast) {
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

    public increasingConnection(currentCheckpointRaycast: CheckpointRaycast, previousCheckpointRaycast: CheckpointRaycast) {
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

    public decreasingConnection(currentCheckpointRaycast: CheckpointRaycast, previousCheckpointRaycast: CheckpointRaycast) {
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
  }

  private static createStableRaycastCheckpoint(exposed: Vector): StableCheckpointRaycast {
    return { exposed };
  }

  private static createReflectiveRaycastCheckpoint(exposed: Vector, endpoint: Vector, endpointSegment: Shape.Segment) {
    return { exposed, endpoint, endpointSegment };
  }
}
