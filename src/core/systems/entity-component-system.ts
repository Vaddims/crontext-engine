import { Transformator } from "objectra";
import { Constructor } from "objectra/dist/types/util.types";
import { Component, ComponentConstructor } from "../component";
import { Entity } from "../entity";

@Transformator.Register({
  // symbolIteratorEntryDepth: 1,
  // useSerializationSymbolIterator: true,
  // getter: (target: EntityComponentSystem, instance: Component) => target.find(instance.constructor as Constructor),
  // setter: (target: EntityComponentSystem, instance: Component) => target.addInstance(instance),
})
export class EntityComponentSystem {
  private readonly components = new Map<ComponentConstructor, Component>();

  @Transformator.ArgumentPassthrough()
  readonly entity: Entity;

  constructor(entity: Entity) {
    this.entity = entity;
  }

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

  // public addInstance<T extends Component>(componentInstance: T) {
  //   const baseConstructor = Component.getBaseclassOf(componentInstance.constructor as Constructor);
  //   if (this.hasInstance(componentInstance)) {
  //     throw new Error(`Component of class ${baseConstructor.name} already exists`);
  //   }

  //   this.components.set(baseConstructor, componentInstance);
  //   return componentInstance;
  // }

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