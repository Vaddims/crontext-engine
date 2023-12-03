import type { Shape } from "../core";
import { Vector } from "../core/vector";
import { Circle } from "../shapes";

export function clamp(number: number, min: number, max: number) {
  return Math.min(Math.max(number, min), max);
}

export function rotatedOffsetPosition(vector: Vector, rotation: number): Vector {
  if (rotation === 0) {
    return vector.duplicate();
  }

  const { sin, cos } = Math;
  const x = vector.x * cos(rotation) - vector.y * sin(rotation);
  const y = vector.x * sin(rotation) + vector.y * cos(rotation);
  return new Vector(x, y);
}

export function nearestPointOnSegment(point: Vector, segment: Shape.Segment) {
  const isolatedSegmentVector = segment[1].subtract(segment[0]);
  const isolatedSegmentStartToPoint = point.subtract(segment[0]);

  const projection = Vector.dot(isolatedSegmentStartToPoint, isolatedSegmentVector);
  const segmentToPointLenghtSquared = isolatedSegmentVector.lenghtSquared;
  const distance = projection / segmentToPointLenghtSquared;

  let nearestPoint: Vector;
  if (distance <= 0) {
    nearestPoint = segment[0];
  } else if (distance >= 1) {
    nearestPoint = segment[1];
  } else {
    nearestPoint = segment[0].add(isolatedSegmentVector.multiply(distance));
  }

  const distanceSquared = Vector.distanceSquared(point, nearestPoint);

  return {
    distanceSquared,
    nearestPoint,
  }
}

export function lineWithLineIntersection(segment1: Shape.Segment, segment2: Shape.Segment) {
  const [x1, y1] = segment1[0].raw;
  const [x2, y2] = segment1[1].raw;
  const [x3, y3] = segment2[0].raw;
  const [x4, y4] = segment2[1].raw;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (denominator === 0) {
    return;
  }

  const pxNominator = (x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4);
  const pyNominotor = (x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4); 
  const p = new Vector(pxNominator, pyNominotor).divide(denominator);
  return p;
}

export function segmentWithSegmentIntersection(segment1: Shape.Segment, segment2: Shape.Segment) {
  const [x1, y1] = segment1[0].raw;
  const [x2, y2] = segment1[1].raw;
  const [x3, y3] = segment2[0].raw;
  const [x4, y4] = segment2[1].raw;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (denominator === 0) {
    return;
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denominator;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    // return new Vector(x1 - t * (x2 - x1), y1 - t * (y2 - y1));
    return new Vector(x3 + u * (x4 - x3), y3 + u * (y4 - y3))
  }
}

export function lineWithDiretionIntersection(pivot: Vector, direction: Vector, segment: Shape.Segment) {
  const [x1, y1] = segment[0].raw;
  const [x2, y2] = segment[1].raw;
  const [x3, y3] = pivot.raw;
  const [x4, y4] = pivot.add(direction).raw;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (denominator === 0) {
    return;
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;

  if (t >= 0 && t <= 1 && u >= 0) {
    return segment[0].add(segment[1].subtract(segment[0]).multiply(t));
  }
}

export function lerp(a: number, b: number, t: number) {
  return a * t + b * (1 - t);
}

export function getBaseLog(x: number, y: number) {
  return Math.log(y) / Math.log(x);
}

export function perpendicularProjection(shape: Shape, axis: Vector) {
  let min = Infinity;
  let max = -Infinity;

  for (const vertex of shape) {
    const projection = Vector.dot(vertex, axis);

    if (projection < min) {
      min = projection;
    }

    if (projection > max) {
      max = projection;
    }
  }

  return [min, max];
}

declare global {
  interface Math {
    avarage(...numbers: number[]): number;
    baseLog(x: number, y: number): number;
  }
}

Math.avarage = function (...avarage: number[]) {
  return avarage.reduce((sum, number) => sum + number, 0) / avarage.length;
}


Math.baseLog = function (x: number, y: number) {
  return Math.log(y) / Math.log(x);
}