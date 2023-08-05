import { EntityTransform } from "./entity-transform";
import { Scene } from "./scene";
import { EntityComponentSystem } from "./systems/entity-component-system";
import { EntityLayerSystem } from "./systems/entity-layer-system";
import { Transformator } from "objectra";

export enum EntitySceneStatus {
  AwaitingInstantiation,
  AwaitingDestruction,
  Idle,
}

@Transformator.Register()
export class Entity {
  public name = "Entity";
  
  private parentScene: Scene | null = null;
  private parentEntity: Entity | null = null;

  public readonly components = new EntityComponentSystem(this);
  public readonly transform = new EntityTransform(this);
  public readonly layers = new EntityLayerSystem();
  private readonly children = new Set<Entity>();

  private readonly cache: { [key: string]: any } = {};

  public establishCacheConnection<T>(key: string) {
    const cache = this.cache;
    
    return {
      get(): T | undefined {
        return cache[key];
      },

      set(value: T) {
        cache[key] = value;
      },

      modify(newCacheCb: (cache: T | undefined) => T) {
        cache[key] = newCacheCb(cache[key]);
      }
    }
  }

  public [Symbol.toPrimitive]() {
    return `Entity(${this.name})`;
  }

  public get scene() {
    // if (!this.parentScene) {
    //   throw new Error(`No scene assigned to entity ${this.name}`);
    // }

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

    return this.parentScene.requestEntityTransformation(this, newParent);
  }

  public destroy() {
    if (!this.parentScene) {
      throw new Error('Cannot destroy an uninstantiated entity');
    }

    return this.parentScene.requestEntityDestruction(this);
  }
}