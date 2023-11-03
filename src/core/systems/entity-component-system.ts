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
  private readonly hoistingComponents = new Map<ComponentConstructor, Component>();

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

  private getSharedInstance<T extends ComponentConstructor>(componentConstructor: T) {
    const baseConstructor = Component.getBaseclassOf(componentConstructor);
    return this.hoistingComponents.get(baseConstructor) ?? null;
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
    const scene = this.entity.scene;

    if (!scene) {
      throw new Error('No scene')
    }

    return scene.requestComponentInstantiation(componentConstructor, this.entity);
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
    for (const componentInstance of this.hoistingComponents.values()) {
      if (instance === componentInstance) {
        return true;
      }
    }

    return false;
  }

  public destroy(componentConstructor: ComponentConstructor) {
    const scene = this.entity.scene;
    if (!scene) {
      throw new Error('No scene')
    }

    return scene.requestComponentDestruction(componentConstructor, this.entity);
  }

  public destoryAll() {
    const scene = this.entity.scene;
    if (!scene) {
      throw new Error('No scene')
    }

    for (const [ componentConstructor ] of this.hoistingComponents) {
      scene.requestComponentDestruction(componentConstructor, this.entity);
    }
  }
}