import { Transformator } from "objectra";
import { Shape } from "../shape";
import { Vector } from "../vector";
import { CheckpointRaycast, VisibilityPolygon, VisibilityPolygonCreationOptions } from "../visibility-polygon";

export interface VisibilityPolygonPanoramaCreationOptions extends VisibilityPolygonCreationOptions {}

// export interface VisibilityPolygonCreationOptions {
//   readonly fulcrum: Vector;
//   readonly obsticles: Shape[];
//   readonly skipObsticleCulling?: boolean;
//   readonly externalMasks: Shape[] & { readonly 0: Shape };
// }

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
      const relativeIndex = i - 1;
      const index = relativeIndex < 0 ? this.checkpointRaycasts.length + relativeIndex : relativeIndex;
      const previousCheckpointRaycast = this.checkpointRaycasts[index];

      if (!previousCheckpointRaycast) {
        throw new Error(`previousCheckpointRaycast doesn't exist`);
      }

      this.establishUniversalConnection(currentCheckpointRaycast, previousCheckpointRaycast);
    }
  }
}