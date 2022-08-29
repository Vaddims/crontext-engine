import { Optic } from "../core/optic";
import { Simulation } from "./simulation";
import { Vector } from "../core/vector";
import { ComponentConstructor, Renderer } from "../core";
import { Entity } from "../core/entity";

export class SimulationInspector {
  public readonly optic = new Optic;
  public previousScale = 0;
  public scaleFactor = 0;
  public scaleStep = 5;

  public readonly inspectEntities: Entity[] = [];

  constructor(renderer: Renderer, public readonly simulation: Simulation) {
    this.optic.pixelsPerUnit = renderer.pixelsPerUnit;

    const opticScale = Math.exp(this.scaleFactor * this.scaleStep);
    this.optic.scale = Vector.one.multiply(opticScale);
  }

  setScale(scale: Vector) {
    this.optic.scale = scale;
    const opticScale = Math.log(scale.x);
    this.scaleFactor = opticScale / this.scaleStep;
  }

  handleOpticMovement(event: WheelEvent) {
    const deltaMovement = new Vector(event.deltaX, event.deltaY).divide(window.devicePixelRatio);
    this.optic.scenePosition = this.optic.scenePosition.add(deltaMovement.multiply(Vector.reverseY, this.optic.scale).divide(20));
  }

  handleOpticScale(scale: number, canvasSize: Vector, mousePosition: Vector) {
    const canvasCenter = canvasSize.divide(2);
    const cursorOffsetFromCenter = mousePosition.subtract(canvasCenter).multiply(Vector.reverseY);
    const offsetPriority = cursorOffsetFromCenter.divide(canvasCenter);

    const centerPriorityPixels = canvasCenter.multiply(offsetPriority);
    const stableUnitFit = centerPriorityPixels.divide(this.optic.scaledPixelsPerUnit());

    const deltaScale = scale - this.previousScale;
    this.previousScale = scale;
    this.scaleFactor -= deltaScale;
    const opticScale = Math.exp(this.scaleFactor * this.scaleStep);
    this.optic.scale = Vector.one.multiply(opticScale);

    const freshUnitFit = centerPriorityPixels.divide(this.optic.scaledPixelsPerUnit());
    const deltaUnitFit = freshUnitFit.subtract(stableUnitFit);
    this.optic.scenePosition = this.optic.scenePosition.add(deltaUnitFit.multiply(Vector.reverse));
  }

  handleClick(event: MouseEvent, canvasCenter: Vector) {
    event.preventDefault();
    event.stopPropagation();
    const offset = new Vector(event.offsetX, event.offsetY).subtract(canvasCenter).multiply(Vector.reverseY);
    const units = offset.divide(this.optic.scaledPixelsPerUnit()).add(this.optic.scenePosition);
  }


}