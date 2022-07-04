import { Shape, Vector } from "../core";

export class Plane extends Shape {
  constructor() {
    super([
      Vector.left.divide(2),
      Vector.right.divide(2)
    ]);
  }
}