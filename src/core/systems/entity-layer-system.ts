import { Layer } from "../layer";

export class EntityLayerSystem extends WeakSet<Layer> {
  override has(layer: Layer) {
    return Layer.registrations.has(layer) && super.has(layer);
  }

  public instances() {
    return Array.from(Layer.registrations).filter(super.has);
  }

  public [Symbol.iterator]() {
    return this.instances().values();
  }
}