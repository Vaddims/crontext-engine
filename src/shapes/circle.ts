import { Transformator } from "objectra";
import { Equilateral } from "./builders/equilateral";

@Transformator.Register()
export class Circle extends Equilateral {
  public constructor() {
    super(20);
  }
}