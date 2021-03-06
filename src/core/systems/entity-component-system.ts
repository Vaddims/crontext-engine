import { Component, ComponentConstructor } from "../component";
import { Entity } from "../entity";

export class EntityComponentSystem {
  private readonly components = new Map<ComponentConstructor, Component>();

  constructor(private readonly entity: Entity) {}

  [Symbol.iterator](): IterableIterator<Component> {
    return this.components.values();
  }
  
  public baseConstructors() {
    return this.components.keys();
  }
  
  public instances() {
    return this.components.values();
  }

  public entries() {
    return this.components.entries();
  }

  public get size() {
    return this.components.size;
  }

  private getSharedInstance<T extends ComponentConstructor>(componentConstructor: T) {
    const baseConstructor = Component.getBaseclassOf(componentConstructor);
    return this.components.get(baseConstructor) ?? null;
  }

  public findOfType<T extends ComponentConstructor>(componentConstructor: T) {
    const instance = this.getSharedInstance(componentConstructor);
    if (instance instanceof componentConstructor) {
      return instance as InstanceType<T>;
    }

    return null;
  }

  public getOfType<T extends ComponentConstructor>(componentConstructor: T) {
    const instance = this.findOfType(componentConstructor);
    if (!instance) {
      throw new Error(`${componentConstructor.name} subclass not found`);
    }

    return instance;
  }

  public find<T extends ComponentConstructor>(componentConstructor: T) {
    const instance = this.getSharedInstance(componentConstructor);
    if (instance && instance.constructor == componentConstructor) {
      return instance as InstanceType<T>;
    }
    
    return null;
  }

  public get<T extends ComponentConstructor>(componentConstructor: T) {
    const instance = this.find(componentConstructor);
    if (!instance) {
      throw new Error(`${componentConstructor.name} instance does not exist`);
    }

    return instance;
  }

  public add<T extends ComponentConstructor>(componentConstructor: T) {
    const baseConstructor = Component.getBaseclassOf(componentConstructor);
    if (this.components.has(baseConstructor)) {
      throw new Error(`Component of class ${baseConstructor.name} already exists`);
    }

    const componentInstance = new componentConstructor(this.entity);
    this.components.set(baseConstructor, componentInstance);
    return componentInstance as InstanceType<T>;
  }

  public hasInstance<T extends Component>(instance: T) {
    for (const componentInstance of this.components.values()) {
      if (instance === componentInstance) {
        return true;
      }
    }

    return false;
  }

  public destroy(componentConstructor: ComponentConstructor) {
    const baseConstructor = Component.getBaseclassOf(componentConstructor);
    return this.components.delete(baseConstructor);
  }

  public destoryAll() {
    this.components.clear();
  }
}