import { Vector } from "./vector";

export abstract class Renderer {
  public readonly context: CanvasRenderingContext2D;
  public scaleDependenceAxis: 'width' | 'height' = 'height';
  public unitFit = 10;

  constructor(public readonly canvas: HTMLCanvasElement) {
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error(`Could not get canvas context`);
    }

    this.context = context; 
  }

  public abstract render(): void;

  public get pixelsPerUnit() {
    return this.canvas[this.scaleDependenceAxis] / this.unitFit;
  }

  public get canvasSize() {
    return new Vector(this.canvas.width, this.canvas.height);
  }

  public get pixelRatio() {
    return this.canvasSize.divide(this.canvasSize.y) // TODO Change axis to dependent
  }
}