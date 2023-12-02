import { Transformator } from "objectra";
import { Layer } from "../layer";

@Transformator.Register<EntityLayerManager, {name: string}[]>({
  serializator: (bridge) => bridge.instance.instances().map(bridge.serialize),
  instantiator: (bridge) => new EntityLayerManager(
    bridge.representer
      .map((serializedLayer: any) => Layer.find(bridge.instantiateRepresenter(serializedLayer.name)))
      .filter(layer => layer instanceof Layer) as readonly Layer[],
  ),
})
export class EntityLayerManager extends WeakSet<Layer> {
  public hasLayer(layer: Layer) {
    return Layer.registrations.has(layer) && super.has(layer);
  }

  public instances() {
    return Array.from(Layer.registrations).filter((layer) => this.hasLayer(layer));
  }

  override [Symbol.iterator]() {
    return this.instances().values();
  }
}