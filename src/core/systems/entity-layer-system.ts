import { Transformator } from "objectra";
import { Constructor } from "objectra/dist/types/util.types";
import { Layer } from "../layer";

@Transformator.Register<EntityLayerSystem, {name: string}[]>({
  serializator: (bridge) => bridge.instance.instances().map(bridge.serialize),
  instantiator: (bridge) => new EntityLayerSystem(
    bridge.representer
      .map((serializedLayer: any) => Layer.find(bridge.instantiateRepresenter(serializedLayer.name)))
      .filter(layer => layer instanceof Layer) as readonly Layer[],
  ),
})
export class EntityLayerSystem extends WeakSet<Layer> {
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