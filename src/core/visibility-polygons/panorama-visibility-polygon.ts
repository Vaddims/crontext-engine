import { Shape } from "../shape";
import { Vector } from "../vector";
import { CheckpointRaycast, VisibilityPolygon, VisibilityPolygonCreationOptions } from "../visibility-polygon";

export interface VisibilityPolygonPanoramaCreationOptions extends VisibilityPolygonCreationOptions {}

export class PanoramaVisibilityPolygon extends VisibilityPolygon {
  constructor(options: VisibilityPolygonPanoramaCreationOptions) {
    const {} = options;

    super(options);

    this.checkpointVertices.push(
      ...Shape.vertexCluster(this.visibleObsticles),
      ...this.obsticlesWithObsticlesInterimVertices,
      ...this.obsticlesWithBoundsInterimVertices,
      ...this.externalMaskBounds.vertices,
    );

    const shapes = [this.externalMaskBounds, ...this.visibleObsticles];
    this.registerRaycastCheckpoints(shapes);

    for (const checkpointRaycast of this.checkpointRaycasts) {
      const { endpoint, endpointSegment } = checkpointRaycast;
      if (endpoint && endpointSegment) {
        this.segmentShareMap.add(endpointSegment, endpoint)
      }
    }

    const relativeCheckpointRotation = (vertex: Vector) => vertex.subtract(this.fulcrum).rotation();
    const positiveRotationComparison = (a: CheckpointRaycast, b: CheckpointRaycast) => (
      relativeCheckpointRotation(a.exposed) - relativeCheckpointRotation(b.exposed)
    );
    
    this.checkpointRaycasts.sort(positiveRotationComparison);

    for (let i = 0; i < this.checkpointRaycasts.length; i++) {
      const currentCheckpointRaycast = this.checkpointRaycasts[i];
      const previousCheckpointRaycast = this.checkpointRaycasts.at(i - 1);

      if (!previousCheckpointRaycast) {
        throw new Error(`previousCheckpointRaycast doesn't exist`);
      }

      this.establishUniversalConnection(currentCheckpointRaycast, previousCheckpointRaycast);
    }
  }
}