import { Transformator } from "objectra";
import { rotatedOffsetPosition, segmentWithSegmentIntersection } from "../utils/crontext-math";
import { Transform } from "./transform";
import { Vector } from "./vector";

export namespace Shape {
  export type Segment = [Vector, Vector];
  export type SegmentIndexes = [number, number];

  export interface SegmentIntersection {
    readonly position: Vector;
    readonly segmentHolders: readonly [Segment, Segment] | [Segment, Segment];
  }
}

@Transformator.Register()
export class Shape {
  protected clockwiseInitialization = false;
  
  @Transformator.ArgumentPassthrough()
  public readonly vertices: ReadonlyArray<Vector>;
  public readonly segmentVertexIndexes: ReadonlyArray<Shape.SegmentIndexes>;
  public readonly segments: ReadonlyArray<Shape.Segment>;

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

  public static segmentIntersections(a: Shape, b: Shape) {
    const intersections: Shape.SegmentIntersection[] = [];
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

  public withScale(scale: Vector | number) {
    const vertices = this.vertices.map(vertex => vertex.multiply(scale));
    return new Shape(vertices);
  }

  public withOffset(vector: Vector) {
    const vertices = this.vertices.map(vertex => vertex.add(vector));
    return new Shape(vertices);
  }

  public getScale() {
    return new Vector(
      Math.abs(this.bounds.vertices[1].x - this.bounds.vertices[0].x),
      Math.abs(this.bounds.vertices[2].y - this.bounds.vertices[1].y),
    );
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

  public overlaps(target: Shape) {
    const shapes = [this, target];

    const perpendicularProjection = (shape: Shape, normal: Vector) => {
      let min = Infinity;
      let max = -Infinity;

      for (const vertex of shape) {
        const projected = normal.x * vertex.x + normal.y * vertex.y;

        if (projected < min) {
          min = projected;
        }

        if (projected > max) {
          max = projected;
        }
      }

      return [min, max];
    }

    for (const shape of shapes) {
      for (const segment of shape.segments) {
        const [p1, p2] = segment;

        const normal = new Vector(p2.y - p1.y, p1.x - p2.x);

        const [minA, maxA] = perpendicularProjection(this, normal);
        const [minB, maxB] = perpendicularProjection(target, normal);

        if (maxA < minB || maxB < minA) {
          return false;
        }
      }
    }

    return true;
  }

  public static vertexCluster(shapes: Shape[]) {
    return shapes.map(shape => shape.vertices).flat();
  }

  public static segmentCluster(shapes: Shape[]) {
    return shapes.map(shape => shape.segments).flat();
  }

  public static boundsOverlaps(a: Shape, b: Shape) {
    const av = a.vertices;
    const bv = b.vertices;
  
    return av[1].x > bv[0].x && av[0].x < bv[1].x && av[0].y > bv[3].y && av[3].y < bv[0].y;
  }
}