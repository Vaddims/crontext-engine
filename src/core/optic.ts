import { Color } from "./color";
import { Vector } from "./vector";

export class Optic {
  public scenePosition = Vector.zero;
  public scale = Vector.one;
  public rotation = 0;

  public canvasRelativePosition = Vector.zero;
  public canvasRelativeSize = Vector.one;

  public background = Color.white;

  public pixelsPerUnit = 1;

  public scaledPixelsPerUnit() {
    return Vector.one.multiply(this.pixelsPerUnit).divide(this.scale);
  }
}