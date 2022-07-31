import { rotatedOffsetPosition, segmentWithSegmentIntersection } from "../utils/crontext-math";
import { Transform } from "./transform";
import { Vector } from "./vector";

export type SegmentIndexes = [number, number];
export type Segment = [Vector, Vector];

export interface ShapeIntersection {
  position: Vector;
  segmentHolders: [Segment, Segment];
}

export class Shape {
  private verticesClockwiseInitialization = false;
  
  public readonly vertices: ReadonlyArray<Vector>;
  public readonly segmentVertexIndexes: ReadonlyArray<SegmentIndexes>;
  public readonly segments: ReadonlyArray<Segment>;

  private cachedBounds: Shape | null = null;

  public constructor(vertices: Vector[]) {
    if (vertices.length < 3) {
      throw new Error(`Shape must have at least 2 vertices`);
    }

    this.vertices = [...vertices];

    if (this.vertices.length > 2) {
      this.segmentVertexIndexes = this.vertices.map((_, i) => {
        const nextIndex = i === this.vertices.length - 1 ? 0 : i + 1;
        return [i, nextIndex];
      });
    } else {
      this.segmentVertexIndexes = [[0, 1]];
    }
  
    this.segments = this.segmentVertexIndexes.map(([i, j]) => [this.vertices[i], this.vertices[j]]);
  }

  public withTransform(transform: Transform) {
    const { position, scale, rotation } = transform;
    return new Shape(this.vertices.map(
      vertex => rotatedOffsetPosition(vertex.multiply(scale), rotation).add(position)
    ));
  }

  public [Symbol.iterator](): IterableIterator<Vector> {
    return this.vertices.values();
  }

  public setRotation() {

  }

  public static intersections(a: Shape, b: Shape) {
    const intersections: ShapeIntersection[] = [];
    for (let i = 0; i < a.segments.length; i++) {
      for (let j = 0; j < b.segments.length; j++) {
        const intersection = segmentWithSegmentIntersection(a.segments[i], b.segments[j]);
        if (!intersection) {
          continue;
        }

        intersections.push({
          position: intersection,
          segmentHolders: [a.segments[i], b.segments[j]]
        })
      }
    }

    return intersections;
  }


  public withRotation(rotation: number) {
    const vertices = this.vertices.map(vertex => rotatedOffsetPosition(vertex, rotation));
    return new Shape(vertices);
  }

  // public transform({ position, scale, rotation }: Transform) {
  //   const vertices = this.vertices.map(vertex => rotatedOffsetPosition(vertex, rotation).multiply(scale).add(position));
  //   return new Shape(vertices);
  // }

  public withScale(scale: Vector | number) {
    const vertices = this.vertices.map(vertex => vertex.multiply(scale));
    return new Shape(vertices);
  }

  public withOffset(vector: Vector) {
    const vertices = this.vertices.map(vertex => vertex.add(vector));
    return new Shape(vertices);
  }

  public get bounds() {
    if (this.cachedBounds) {
      return this.cachedBounds;
    }

    let topRightVector = this.vertices[0];
    let bottomLeftVector = this.vertices[0];

    for (const vertex of this) {
      if (vertex.x > topRightVector.x) {
        topRightVector = new Vector(vertex.x, topRightVector.y);
      }

      if (vertex.y > topRightVector.y) {
        topRightVector = new Vector(topRightVector.x, vertex.y);
      }

      if (vertex.x < bottomLeftVector.x) {
        bottomLeftVector = new Vector(vertex.x, bottomLeftVector.y);
      }

      if (vertex.y < bottomLeftVector.y) {
        bottomLeftVector = new Vector(bottomLeftVector.x, vertex.y);
      }
    }

    const bounds = new Shape([
      new Vector(bottomLeftVector.x, topRightVector.y),
      new Vector(...topRightVector.raw),
      new Vector(topRightVector.x, bottomLeftVector.y),
      new Vector(...bottomLeftVector.raw),
    ])

    this.cachedBounds = bounds;
    return bounds;
  }
}