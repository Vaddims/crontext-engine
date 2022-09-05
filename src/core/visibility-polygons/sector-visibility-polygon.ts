import { Ray } from "../ray";
import { Shape } from "../shape";
import { Vector } from "../vector";
import { CheckpointRaycast, VisibilityPolygon, VisibilityPolygonCreationOptions } from "../visibility-polygon";

export interface VisibilityPolygonSectorOptions extends VisibilityPolygonCreationOptions {
  readonly direction: Vector;
  readonly angle: number;
  readonly nearPlane: number;
}

export class SectorVisibilityPolygon extends VisibilityPolygon {
  public constructor(options: VisibilityPolygonSectorOptions) {
    const { fulcrum, direction, angle, nearPlane } = options;

    super(options);

    this.checkpointVertices.push(
      ...Shape.vertexCluster(this.visibleObsticles),
      ...this.obsticlesWithObsticlesInterimVertices,
      ...this.obsticlesWithBoundsInterimVertices,
      ...this.externalMaskBounds.vertices,
    );

    const shapes = [this.externalMaskBounds, ...this.visibleObsticles];
    this.registerRaycastCheckpoints(shapes);
      
    const createLimiterReflectiveCheckpoint = (angle: number) => {
      const resolution = new Ray(fulcrum, Vector.fromAngle(angle)).cast(shapes)!;
      return VisibilityPolygon.createReflectiveRaycastCheckpoint(
        resolution.direction.normalized.multiply(nearPlane).add(fulcrum),
        resolution.intersectionPosition,
        resolution.segment,
      );
    };

    const normalizeRotation = (angle: number) => (angle >= 0 ? angle : angle + Math.PI * 2) % (Math.PI * 2);
    const basisAngle = normalizeRotation(direction.rotation() % (Math.PI * 2));

    const angleDifference = angle / 2;
    const negativeAngle = normalizeRotation(basisAngle - angleDifference);
    const positiveAngle = normalizeRotation(basisAngle + angleDifference);
    const negativeRaycastCheckpoint = createLimiterReflectiveCheckpoint(negativeAngle);
    const positiveRaycastCheckpoint = createLimiterReflectiveCheckpoint(positiveAngle);

    this.checkpointRaycasts.push(negativeRaycastCheckpoint, positiveRaycastCheckpoint);

    for (const checkpointRaycast of this.checkpointRaycasts) {
      const { endpoint, endpointSegment } = checkpointRaycast;
      if (endpoint && endpointSegment) {
        this.segmentShareMap.add(endpointSegment, endpoint)
      }
    }

    const sectorViewportCheckpointRaycasts = this.checkpointRaycasts.filter(raycast => {
      if (raycast === negativeRaycastCheckpoint || raycast === positiveRaycastCheckpoint) {
        return true;
      }

      const rotation = raycast.exposed.subtract(fulcrum).rotation();
      if (negativeAngle <= positiveAngle) {
        return rotation >= negativeAngle && rotation <= positiveAngle;
      }

      return rotation >= negativeAngle || rotation <= positiveAngle;
    });

    const relativeCheckpointRotation = (vertex: Vector) => vertex.subtract(this.fulcrum).rotation();
    const positiveRotationComparison = (a: CheckpointRaycast, b: CheckpointRaycast) => (
      relativeCheckpointRotation(a.endpoint ?? a.exposed) - relativeCheckpointRotation(b.endpoint ?? b.exposed)
    );
    
    this.checkpointRaycasts.length = 0;
    this.checkpointRaycasts.push(...sectorViewportCheckpointRaycasts);
    this.checkpointRaycasts.sort(positiveRotationComparison);

    for (let i = 0; i < this.checkpointRaycasts.length; i++) {
      const currentCheckpointRaycast = this.checkpointRaycasts[i];
      const previousCheckpointRaycast = this.checkpointRaycasts.at(i - 1);

      if (!previousCheckpointRaycast) {
        throw new Error(`previousCheckpointRaycast doesn't exist`);
      }

      if (currentCheckpointRaycast.exposed === negativeRaycastCheckpoint.exposed) {
        this.path.push(currentCheckpointRaycast.exposed, currentCheckpointRaycast.endpoint!);
        continue;
      }

      if (currentCheckpointRaycast.exposed === positiveRaycastCheckpoint.exposed) {
        this.path.push(currentCheckpointRaycast.endpoint!, currentCheckpointRaycast.exposed);
        continue;
      }

      this.establishUniversalConnection(currentCheckpointRaycast, previousCheckpointRaycast);
    }
  }
}