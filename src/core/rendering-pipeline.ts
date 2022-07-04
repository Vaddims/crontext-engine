import { Renderer } from "./renderer";

export abstract class RenderingPipeline {
  constructor(public readonly context: CanvasRenderingContext2D) {}
}

export interface RenderingPipelineConstructor<T extends Renderer = Renderer, V extends RenderingPipeline = RenderingPipeline> {
  new (renderer: T): V;
}
