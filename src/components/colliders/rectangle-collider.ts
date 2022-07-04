import { Rectangle } from "../../shapes";
import { Collider } from "../collider";

export class RectangleCollider extends Collider {
  public readonly shape = new Rectangle();
}