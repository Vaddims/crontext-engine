import { Transformator } from "objectra";
import { Shape, Vector } from "../core";

@Transformator.Register()
export class IcocelesTriangle extends Shape {
  public constructor() {
    super([
      new Vector(0, .5),
      new Vector(.5, -.5),
      new Vector(-.5, -.5)
    ])
  }
}