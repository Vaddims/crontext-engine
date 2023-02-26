import { Transformator } from "objectra";
import { Equilateral } from "./builders/equilateral";

@Transformator.Register()
export class Triangle extends Equilateral {
  public constructor() {
    super(3);
  }
}