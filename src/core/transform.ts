import { Vector } from "./vector";

export class Transform {
  constructor(public position: Vector, public scale: Vector, public rotation: number) {}

  public static scale(scale: Vector) {
    return new Transform(Vector.zero, scale, 0);
  }

  public static position(position: Vector) {
    return new Transform(position, Vector.one, 0);
  }

  public static rotation(rotation: number) {
    return new Transform(Vector.zero, Vector.one, rotation);
  }
}