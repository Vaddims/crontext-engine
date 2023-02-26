import { Transformator } from "objectra";
import { Shape, Vector } from "../core";

@Transformator.Register()
export class Plane extends Shape {
  constructor() {
    super([
      Vector.left.divide(2),
      Vector.right.divide(2)
    ]);
  }
}