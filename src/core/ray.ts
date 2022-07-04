import { Collider } from "../components";
import { lineWithDiretionIntersection } from "../utils";
import { Collision } from "./collision";
import { Entity } from "./entity";
import { Scene } from "./scene";
import { Shape } from "./shape";
import { Vector } from "./vector";

export interface RayResolution {
  intersectionPosition: Vector,
  segment: Segment,
}

export interface SceneRayResolution extends RayResolution {
  segmentVertexIndexes: [number, number],
  collider: Collider,
  entity: Entity,
}

type Segment = [Vector, Vector];

export class Ray {
  constructor(readonly pivot: Vector, readonly direction: Vector, readonly distance = Infinity) {}

  cast(scene: Scene): SceneRayResolution | null;
  cast(segments: Segment[]): RayResolution | null;
  cast(input: Scene | Segment[]) {
    if (input instanceof Scene) {
      return this.castScene(input);
    }

    return this.castSegments(input);
  }

  private castScene(scene: Scene): SceneRayResolution | null {
    let closestResolution: SceneRayResolution | null = null;
    let distanceRecord = Infinity;

    for (const entity of scene) {
      const collider = entity.components.findOfType(Collider);
      if (!collider) {
        continue;
      }

      const vertices = collider.relativeVerticesPosition();
      const segmentIndexes = new Shape(vertices).getSegmentIndexes();
      for (const [i, j] of segmentIndexes) {
        const vertex = vertices[i];
        const nextVertex = vertices[j];

        const detectedAt = this.detect(vertex, nextVertex);
        if (!detectedAt) {
          continue;
        }

        const distance = Vector.distance(this.pivot, detectedAt);
        if (distance < distanceRecord) {
          distanceRecord = distance;
          closestResolution = {
            segmentVertexIndexes: [i, j],
            segment: [vertex, nextVertex],
            intersectionPosition: detectedAt,
            collider,
            entity,
          };
        }
      }
    }

    return closestResolution;
  }

  private castSegments(segments: Segment[]): RayResolution | null {
    let closestResolution: RayResolution | null = null;
    let distanceRecord = Infinity;

    for (const segment of segments) {
      const detectedAt = this.detect(segment[0], segment[1]);
      if (!detectedAt) {
        continue;
      }

      const distance = Vector.distance(this.pivot, detectedAt);
      if (distance < distanceRecord) {
        distanceRecord = distance;
        closestResolution = {
          intersectionPosition: detectedAt,
          segment,
        };
      }
    }

    return closestResolution;
  }

  research(scene: Scene): SceneRayResolution[];
  research(segments: Segment[]): RayResolution[];
  research(input: Scene | Segment[]) {
    if (input instanceof Scene) {
      return this.researchScene(input);
    }

    return this.researchSegments(input);
  }

  private researchScene(scene: Scene) {
    const resolutions: SceneRayResolution[] = [];

    for (const entity of scene) {
      const collider = entity.components.findOfType(Collider);
      if (!collider) {
        continue;
      }

      const vertices = collider.relativeVerticesPosition();
      const segmentIndexes = new Shape(vertices).getSegmentIndexes();
      for (const [i, j] of segmentIndexes) {
        const vertex = vertices[i];
        const nextVertex = vertices[j];

        const detectedAt = this.detect(vertex, nextVertex);
        if (!detectedAt) {
          continue;
        }

        resolutions.push({
          segmentVertexIndexes: [i, j],
          intersectionPosition: detectedAt,
          segment: [vertex, nextVertex],
          collider,
          entity,
        })
      }
    }

    return resolutions;
  }

  private researchSegments(segments: Segment[]) {
    const resolutions: RayResolution[] = [];
    for (const segment of segments) {
      const detectedAt = this.detect(segment[0], segment[1]);
      if (!detectedAt) {
        continue;
      }

      resolutions.push({
        intersectionPosition: detectedAt,
        segment,
      })
    }

    return resolutions;
  }

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

  public static isPointInsideSegments(segments: Segment[], point: Vector) {
    const ray = new Ray(point, Vector.right) ;
    const resolution = ray.research(segments);
    return resolution.length % 2 === 1;
  }
}