import { Shape } from "../core/shape";
import { Vector } from "../core/vector";

export class Rectangle extends Shape {
  constructor() {
    super([
      new Vector(-0.5, 0.5),
      new Vector(0.5, 0.5),
      new Vector(0.5, -0.5),
      new Vector(-0.5, -0.5),
    ]);
  }
}