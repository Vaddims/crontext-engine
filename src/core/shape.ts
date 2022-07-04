import { rotatedOffsetPosition } from "../utils/crontext-math";
import { Vector } from "./vector";

export type SegmentIndexes = [number, number];
export type Segment = [Vector, Vector];

export class Shape {
  public readonly vertices: Vector[];

  public constructor(vertices: Vector[]) {
    this.vertices = [...vertices];
  }

  public [Symbol.iterator](): IterableIterator<Vector> {
    return this.vertices.values();
  }

  public getSegmentIndexes(): SegmentIndexes[] {
    if (this.vertices.length === 2) {
      return [[0, 1]];
    }

    const indexes: SegmentIndexes[] = []
    for (let i = 0; i < this.vertices.length; i++) {
      const nextIndex = i === this.vertices.length - 1 ? 0 : i + 1;
      indexes.push([i, nextIndex]);
    }

    return indexes;
  }

  public getSegments() {
    const segmentIndexes = this.getSegmentIndexes();
    const segments: Segment[] = [];
    for (const [i, j] of segmentIndexes) {
      segments.push([this.vertices[i], this.vertices[j]]);
    }

    return segments;
  }

  public withRotation(rotation: number) {
    const vertices = this.vertices.map(vertex => rotatedOffsetPosition(vertex, rotation));
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

  public getBoundaryRectangle() {
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
      new Vector(...bottomLeftVector.raw)
    ]);
  }
}
