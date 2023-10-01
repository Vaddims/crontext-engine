import { Transformator } from "objectra";
import { Equilateral } from "./builders/equilateral";

@Transformator.Register()
export class Circle extends Equilateral {
  @Transformator.ArgumentPassthrough()
  public readonly radius: number;

  public constructor(radius = .5) {
    super(10, radius);
    this.radius = radius;
  }
}