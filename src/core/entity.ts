import { nanoid } from "nanoid";
import { EntityTransform } from "./entity-transform";
import { Scene, Signal } from "./scene";
import { EntityComponentManager } from "./managers/entity-component-manager";
import { EntityLayerManager } from "./managers/entity-layer-manager";
import { Transformator } from "objectra";
import { TickCacheManager } from "./cache/tick-cache-manager";

export enum EntitySceneStatus {
  AwaitingInstantiation,
  AwaitingDestruction,
  Idle,
}

@Transformator.Register()
export class Entity {
  public name = "Entity";
  public readonly id = nanoid();
  
  private parentScene: Scene | null = null;
  private parentEntity: Entity | null = null;

  public readonly components = new EntityComponentManager(this);
  public readonly transform = new EntityTransform(this);
  public readonly layers = new EntityLayerManager();
  private readonly children = new Set<Entity>();

  @Transformator.Exclude()
  public readonly cacheManager = new TickCacheManager();
  @Transformator.Exclude()
  public readonly cache = this.cacheManager.cache;

  @Transformator.Exclude()
  private readonly cachee: { [key: string]: any } = {};
  public establishCacheConnection<T>(key: string) {
    const cache = this.cachee;
    
    return {
      get(): T | undefined {
        return cache[key];
      },

      set(value: T) {
        cache[key] = value;
      },

      modify(newCacheCb: (cache: T | undefined) => T) {
        cache[key] = newCacheCb(cache[key]);
      },

      delete() {
        delete cache[key];
      }
    }
  }

  public [Symbol.toPrimitive]() {
    return `Entity(${this.name})`;
  }

  public get scene() {
    if (!this.parentScene) {
      throw new Error(`No scene assigned to entity ${this.name}`);
    }

    return this.parentScene;
  }

  public get parent() {
    return this.parentEntity;
  }

  public get isHoisted() { // Hoisted in scene (top level entity)
    return this.scene && !this.parent;
  }

  public getFlattenChildren() {
    const flattenChildren = [];
    let entity: Entity = this;
    let i = 0;

    while(entity) {
      const { children } = entity;
      flattenChildren.push(...children);
      entity = flattenChildren[i++];
    }

    return flattenChildren;
  }

  public getChildren() {
    return [...this.children];
  }

  public setParent(newParent: Entity | null) {
    if (!this.parentScene) {
      throw new Error('Cannot set parent to an uninstantiated entity');
    }

    return this.parentScene.useSignal<Signal.EntityTransformation>({
      type: Signal.Type.EntityTransformation,
      entity: this,
      parent: newParent,
    })
  }

  public destroy() {
    if (!this.parentScene) {
      throw new Error('Cannot destroy an uninstantiated entity');
    }

    return this.parentScene.useSignal<Signal.EntityDestruction>({
      type: Signal.Type.EntityDestruction,
      entity: this,
    });
  }

  public instantiateComponent() {

    // return this.useSignal<Signal.ComponentInstantiation>({
    //   type: Signal.Type.ComponentInstantiation,
      
    // });

  //   const componentInstantiationRequest: Signal.Creator<Signal.ComponentInstantiation<T>> = {
  //     type: Signal.Type.ComponentInstantiation,
  //     componentConstructor,
  //     entity,
  //   };

  //   const signal = this.createFunctionalSignal(componentInstantiationRequest);
  //   this.add(signal);
  //   return signal;
  }
}