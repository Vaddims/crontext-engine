import { Simulation } from "../simulations";
import { TickCache, TickCacheManager } from "./cache/tick-cache-manager";
import { Input } from "./input";
import { Optic } from "./optic";
import { Vector } from "./vector";

export interface Renderer extends Input.ComponentActions {
  defineListeners?(): () => void;
  // [Input.onMouseDown]?(interaction: Input.Mouse.Interaction): void;
  // [Input.onMouseDown]?(interaction: Input.Mouse.Interaction): void;
  // [Input.onMouseUp]?(interaction: Input.Mouse.Interaction): void;
}

export abstract class Renderer {
  public targetResolution: Vector | null = null; // null = auto scale / vector = resolution in pixels
  public readonly canvas: HTMLCanvasElement;
  public readonly context: CanvasRenderingContext2D;
  public scaleDependenceAxis: 'width' | 'height' | 'pixel' = 'height';
  public unitFit = 10;

  private cacheManager = new TickCacheManager();
  public cache = this.cacheManager.cache;

  public readonly cacheGroups: Renderer.CacheGroups = {
    inputReceiver: this.cacheManager.group(Input.onMouseUp, Input.onMouseDown, Input.onMouseMove),
  }

  public abstract readonly simulation: Simulation;

  constructor() {
    const canvas = document.createElement('canvas');

    this.canvas = canvas;
    this.context = this.canvas.getContext('2d')!;

    this.useListeners();
  }

  public abstract render(): void;
  public updateTick() {
    this.cacheGroups.inputReceiver.tickAll();
  };

  public resize(size: Vector) {
    const { canvas } = this;
    [canvas.width, canvas.height] = size.raw;
    this.render()
  }

  public useListeners() {
    const removeDefinedListeners = this.defineListeners?.();

    return function removeListeners() {
      removeDefinedListeners?.();
    }
  }

  public canvasPointToCoordinates(optic: Optic, screenPoint: Vector) {
    optic.pixelsPerUnit = this.pixelsPerUnit;
    const canvasCenter = this.canvasSize.divide(2);
    const opticPixelOffset = optic.scenePosition.multiply(optic.scaledPixelsPerUnit()).multiply(Vector.reverseY);
    const centerPixelOffset = canvasCenter.subtract(opticPixelOffset);
    const relativePixelOffset = screenPoint.subtract(centerPixelOffset);
    const scenePosition = relativePixelOffset.divide(optic.scaledPixelsPerUnit()).multiply(Vector.reverseY)
    return scenePosition;
  }

  public get pixelsPerUnit() {
    if (this.scaleDependenceAxis === 'pixel') {
      return this.unitFit;
    }

    return this.canvas[this.scaleDependenceAxis] / this.unitFit;
  }

  public get canvasSize() {
    return new Vector(this.canvas.width, this.canvas.height);
  }

  public get pixelRatio() {
    return this.canvasSize.divide(this.canvasSize.y) // TODO Change axis to dependent
  }

  public abstract getRenderingOpticCaptures(position: Vector): Renderer.OpticCapture<unknown>[];
}

export namespace Renderer {
  export namespace PointOpticInformation {
    export interface Pure {
      readonly optic: Optic;
    }

    export interface WithPayload<P> {
      readonly optic: Optic;
      readonly payload: P;
    }
  }

  export type OpticCapture<P = null> = {
    readonly optic: Optic;
    readonly payload: P;
  }

  export interface CacheGroups {
    readonly inputReceiver: TickCache.Group.Controller;
  }
}