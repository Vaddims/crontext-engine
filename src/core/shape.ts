import { Transformator } from "objectra";
import { perpendicularProjection, rotatedOffsetPosition, segmentWithSegmentIntersection } from "../utils/crontext-math";
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
  
  @Transformator.ConstructorArgument()
  public readonly vertices: ReadonlyArray<Vector>;
  public readonly segmentVertexIndexes: ReadonlyArray<Shape.SegmentIndexes>;
  public readonly segments: ReadonlyArray<Shape.Segment>;
  public readonly segmentNormals: ReadonlyArray<Vector>;

  @Transformator.Exclude()
  private cachedBounds: Shape | null = null;

  private originCenterOffsetFromArithmeticMean = Vector.zero;

  public constructor(vertices: Vector[] | readonly Vector[], centralize = false) {
    if (vertices.length < 3) {
      throw new Error(`Shape must have at least 2 vertices`);
    }

    const arithmeticMeanCenter = Vector.arithemticMean(...vertices);
    if (centralize) {
      this.vertices = vertices.map(vector => vector.subtract(arithmeticMeanCenter));
    } else {
      this.originCenterOffsetFromArithmeticMean = arithmeticMeanCenter.multiply(Vector.reverse);
      this.vertices = [...vertices];
    }


    if (this.vertices.length > 2) {
      this.segmentVertexIndexes = this.vertices.map((_, i) => {
        const nextIndex = i === this.vertices.length - 1 ? 0 : i + 1;
        return [i, nextIndex];
      });
    } else {
      this.segmentVertexIndexes = [[0, 1]];
    }
  
    this.segments = this.segmentVertexIndexes.map(([i, j]) => [this.vertices[i], this.vertices[j]]);
    this.segmentNormals = this.segments.map(([p1, p2]) => new Vector(-(p2.y - p1.y), (p2.x - p1.x)));
  }

  public [Symbol.iterator](): IterableIterator<Vector> {
    return this.vertices.values();
  }

  public static getSegmentCenter(segment: Shape.Segment) {
    const difference = segment[1].subtract(segment[0]);
    const center = difference.divide(2).add(segment[0]);
    return center;
  }

  public static getSegmentNormal(segment: Shape.Segment) {
    const [ p1, p2 ] = segment;
    return new Vector(-(p2.y - p1.y), (p2.x - p1.x)).normalized;
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

  public withTransform(transform: Transform) {
    const { position, scale, rotation } = transform;
    const shape = this.withOffset(position).withScale(scale).withRotation(rotation);
    shape.originCenterOffsetFromArithmeticMean = this.originCenterOffsetFromArithmeticMean;
    return shape;
  }

  public withRotation(rotation: number) {
    const center = this.arithmeticMean().add(this.originCenterOffsetFromArithmeticMean);
    const vertices = this.vertices.map(vertex => rotatedOffsetPosition(vertex.subtract(center), rotation).add(center));
    const shape = new Shape(vertices);
    shape.originCenterOffsetFromArithmeticMean = this.originCenterOffsetFromArithmeticMean;
    return shape;
  }

  public withScale(scale: Vector | number) {
    const center = this.arithmeticMean().add(this.originCenterOffsetFromArithmeticMean);
    const vertices = this.vertices.map(vertex => vertex.subtract(center).multiply(scale).add(center));
    const shape = new Shape(vertices);
    shape.originCenterOffsetFromArithmeticMean = this.originCenterOffsetFromArithmeticMean.multiply(scale);
    return shape;
  }

  public withOffset(vector: Vector) {
    const vertices = this.vertices.map(vertex => vertex.add(vector));
    const shape = new Shape(vertices);
    shape.originCenterOffsetFromArithmeticMean = this.originCenterOffsetFromArithmeticMean;
    return shape;
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

    let normal = Vector.zero;
    let depth = Infinity;

    for (const shape of shapes) {
      for (let i = 0; i < shape.segments.length; i++) {
        const axis = shape.segmentNormals[i].normalized;

        const [minA, maxA] = perpendicularProjection(this, axis);
        const [minB, maxB] = perpendicularProjection(target, axis);

        if (maxA < minB || maxB < minA) {
          return null;
        }

        const axisDepth = Math.min(maxB - minA, maxA - minB);

        if (axisDepth < depth) {
          depth = axisDepth;
          normal = axis;
        }
      }
    }

    const centerA = this.arithmeticMean()
    const centerB = target.arithmeticMean();
    const direction = centerB.subtract(centerA);

    if (Vector.dot(direction, normal) < 0) {
      normal = normal.multiply(Vector.reverse);
    }

    return {
      depth,
      normal,
    };
  }

  public boundCenter() {
    const diagonal = this.bounds.vertices[1].subtract(this.bounds.vertices[3]);
    const center = diagonal.divide(2).add(this.bounds.vertices[3]);
    return center;
  }

  public arithmeticMean() {
    const center = Vector.zero; // Start with a center vector at origin

    for (const vector of this.vertices) {
      center.add(vector); // Add each vector to calculate the center
    }

    center.divide(this.vertices.length); // Divide by the number of vectors to get the center

    // let xOffsetSum = 0;
    // let yOffsetSum = 0;
    let offsetSum = Vector.zero;

    for (const vector of this.vertices) {
      const offset = vector.subtract(center);
      offsetSum = offsetSum.add(offset);

      // const xOffset = vector.x - center.x;
      // const yOffset = vector.y - center.y;

      // xOffsetSum += xOffset;
      // yOffsetSum += yOffset;
    }

    // const xOffsetMean = xOffsetSum / this.vertices.length;
    // const yOffsetMean = yOffsetSum / this.vertices.length;
    // const averageVertex = new Vector(center.x + xOffsetMean, center.y + yOffsetMean);

    const offsetMean = offsetSum.divide(this.vertices.length);
    const averageVertex = center.add(offsetMean);
    return averageVertex;
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