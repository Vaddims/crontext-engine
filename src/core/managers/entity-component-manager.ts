import { Transformator } from "objectra";
import { Component } from "../component";
import { Entity } from "../entity";
import { Signal } from "../scene";

@Transformator.Register()
export class EntityComponentManager {
  private readonly hoistingComponents = new Map<Component.Constructor, Component>();

  @Transformator.ConstructorArgument()
  readonly entity: Entity;

  constructor(entity: Entity) {
    this.entity = entity;
  }

  [Symbol.iterator](): IterableIterator<Component> {
    return this.hoistingComponents.values();
  }
  
  public baseConstructors() {
    return this.hoistingComponents.keys();
  }
  
  public instances() {
    return this.hoistingComponents.values();
  }

  public entries() {
    return this.hoistingComponents.entries();
  }

  public get size() {
    return this.hoistingComponents.size;
  }

  private getSharedInstance<T extends Component.Constructor>(componentConstructor: T) {
    const baseConstructor = Component.getBaseclassOf(componentConstructor);
    return this.hoistingComponents.get(baseConstructor) ?? null;
  }

  public findOfType<T extends Component.Constructor>(componentConstructor: T) {
    const instance = this.getSharedInstance(componentConstructor);
    if (instance instanceof componentConstructor) {
      return instance as InstanceType<T>;
    }

    return null;
  }

  public getOfType<T extends Component.Constructor>(componentConstructor: T) {
    const instance = this.findOfType(componentConstructor);
    if (!instance) {
      throw new Error(`${componentConstructor.name} subclass not found`);
    }

    return instance;
  }

  public find<T extends Component.Constructor>(componentConstructor: T) {
    const instance = this.getSharedInstance(componentConstructor);
    if (instance && instance.constructor == componentConstructor) {
      return instance as InstanceType<T>;
    }
    
    return null;
  }

  public get<T extends Component.Constructor>(componentConstructor: T) {
    const instance = this.find(componentConstructor);
    if (!instance) {
      throw new Error(`${componentConstructor.name} instance does not exist`);
    }

    return instance;
  }

  public add<T extends Component.Constructor>(componentConstructor: T) {
    const scene = this.entity.scene;

    if (!scene) {
      throw new Error('No scene')
    }

    return this.entity.scene.useSignal<Signal.ComponentInstantiation>({
      type: Signal.Type.ComponentInstantiation,
      entity: this.entity,
      componentConstructor,
    });
  }

  public hasInstance<T extends Component>(instance: T) {
    for (const componentInstance of this.hoistingComponents.values()) {
      if (instance === componentInstance) {
        return true;
      }
    }

    return false;
  }

  public destroy(componentConstructor: Component.Constructor) {
    const scene = this.entity.scene;
    if (!scene) {
      throw new Error('No scene')
    }

    return scene.useSignal<Signal.ComponentDestruction>({
      type: Signal.Type.ComponentDestruction,
      entity: this.entity,
      componentConstructor,
    });
  }

  public destoryAll() {
    const scene = this.entity.scene;
    if (!scene) {
      throw new Error('No scene')
    }

    for (const isntance of this.hoistingComponents.values()) {
      isntance.destroy();
    }
  }
}