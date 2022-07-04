import { Component, ComponentConstructor, Renderer, Shape } from "../core";
import { SimulationRenderingPipeline } from "../rendering-pipelines";
import { Collider } from "./collider";
import { MeshRenderer } from "./mesh-renderer";

export interface LightSource {
  render(renderer: SimulationRenderingPipeline): void;
}

export class LightSource extends Component {
  public physicalRenderingDependence: ComponentConstructor<MeshRenderer> | ComponentConstructor<Collider> = MeshRenderer;
}