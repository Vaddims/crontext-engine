import { Vector } from "./vector";

export class Transform {
  constructor(public position = Vector.zero, public scale = Vector.one, public rotation = 0) {}

  public setPosition(position: Vector) {
    this.position = position;
    return this;
  }

  public setScale(scale: Vector) {
    this.scale = scale;
    return this;
  }

  public setRotation(rotation: number) {
    this.rotation = rotation;
    return this;
  }

  public static setScale(scale: Vector) {
    return new Transform(Vector.zero, scale, 0);
  }

  public static setPosition(position: Vector) {
    return new Transform(position, Vector.one, 0);
  }

  public static setRotation(rotation: number) {
    return new Transform(Vector.zero, Vector.one, rotation);
  }
}