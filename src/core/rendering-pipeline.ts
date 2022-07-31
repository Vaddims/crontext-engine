import { Renderer } from "./renderer";

export abstract class RenderingPipeline<T extends Renderer = Renderer> {
  constructor(public readonly renderer: T) {}
}

export interface RenderingPipelineConstructor<T extends Renderer = Renderer, V extends RenderingPipeline = RenderingPipeline> {
  new (renderer: T): V;
}
