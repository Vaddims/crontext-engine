import { rotatedOffsetPosition } from "../utils/crontext-math";
import { Transform } from "./transform";
import { Vector } from "./vector";

export type SegmentIndexes = [number, number];
export type Segment = [Vector, Vector];

export class Shape {
  private verticesClockwiseInitialization = false;

  public readonly vertices: ReadonlyArray<Vector>;
  public readonly segmentVertexIndexes: ReadonlyArray<SegmentIndexes>;
  public readonly segments: ReadonlyArray<Segment>;

  public constructor(vertices: Vector[]) {
    if (vertices.length < 2) {
      throw new Error(`Shape must have at least 3 vertices`);
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

  public [Symbol.iterator](): IterableIterator<Vector> {
    return this.vertices.values();
  }

  public withRotation(rotation: number) {
    const vertices = this.vertices.map(vertex => rotatedOffsetPosition(vertex, rotation));
    return new Shape(vertices);
  }

  public transform({ position, scale, rotation }: Transform) {
    const vertices = this.vertices.map(vertex => rotatedOffsetPosition(vertex, rotation).multiply(scale).add(position));
    return new Shape(vertices);
  }

  public withScale(scale: Vector | number) {
    const vertices = this.vertices.map(vertex => vertex.multiply(scale));
    return new Shape(vertices);
  }

  public withOffset(vector: Vector) {
    const vertices = this.vertices.map(vertex => vertex.add(vector));
    return new Shape(vertices);
  }

  public withTransform(rotation: number, scale: Vector) {
    const scaledShape = this.withScale(scale);
    const transformedShape = scaledShape.withRotation(rotation);
    return transformedShape;
  }

  public get bounds() {
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

    return new Shape([
      new Vector(bottomLeftVector.x, topRightVector.y),
      new Vector(...topRightVector.raw),
      new Vector(topRightVector.x, bottomLeftVector.y),
      new Vector(...bottomLeftVector.raw),
    ]);
  }
}