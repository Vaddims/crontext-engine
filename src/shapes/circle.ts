import { Transformator } from "objectra";
import { Equilateral } from "./builders/equilateral";

@Transformator.Register()
export class Circle extends Equilateral {
  public constructor(radius = .5) {
    super(20, radius);
  }
}