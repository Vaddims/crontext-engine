import { SimulationNode } from "./simulation-node";
import { EntityTransform } from "./entity-transform";
import { Scene } from "./scene";
import { EntityComponentSystem } from "./systems/entity-component-system";
import { EntityLayerSystem } from "./systems/entity-layer-system";

export class Entity extends SimulationNode {
  public name = "Entity";

  protected readonly children = new Set<Entity>();
  public readonly components = new EntityComponentSystem(this);
  public readonly transform = new EntityTransform(this);
  public readonly layers = new EntityLayerSystem();

  public setParent(parent: SimulationNode) {
    const currentParent = this.tryGetParent();
    if (currentParent) {
      currentParent.children.delete(this);
    }

    this.parentNode = parent;
    if (parent instanceof Entity) {
      parent.children.add(this);
    }
  }

  public getChildren() {
    return Array.from(this.children);
  }

  public tryGetScene() {
    const topNode = this.getTopNode();
    if (topNode instanceof Scene) {
      return topNode;
    }

    return null;
  }

  public tryGetParent() {
    const parent = this.parentNode;
    if (parent !== null && parent instanceof Entity) {
      return parent;
    }

    return null;
  }

  public getScene() {
    const scene = this.tryGetScene();
    if (!scene) {
      throw new Error(`Entity \`${this.name}\` does not have a parent scene`);
    }

    return scene;
  }

  public getParent() {
    const entity = this.tryGetParent();
    if (!entity) {
      throw new Error(`Entity \`${this.name}\` does not have a parent entity`);
    }

    return entity;
  }
}