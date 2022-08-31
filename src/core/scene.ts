import { SceneEventRequestSystem } from "./scene-event-request-system";
import { Component, ComponentConstructor } from "./component";
import { Entity } from "./entity";

export class Scene extends SceneEventRequestSystem implements Iterable<Entity> {
  public name = 'Scene';

  private readonly hoistedEntities = new Set<Entity>();
  private readonly entityInstances = new Set<Entity>();
  private readonly instantiationRequests = new Set<Entity>();

  public [Symbol.iterator]() {
    return this.entityInstances.values();
  }

  public getHoistedEntities() {
    return [...this.hoistedEntities];
  }

  public getEntities() {
    return [...this];
  }
  
  public instantiate(entity: Entity) {
    entity['createInstantiationEventRequest'](this);
    this.instantiationRequests.add(entity);
  }

  public isEntityAwaitingInstantiation(entity: Entity) {
    return this.instantiationRequests.has(entity);
  }

  public find(name: string) {
    return this.getEntities().find(entity => entity.name === name);
  }

  public getComponents() {
    const components: Component[] = [];
    function parseEntity(entity: Entity) {
      for (const component of entity.components) {
        components.push(component);
      }

      const children = entity.getChildren();
      for (const child of children) {
        parseEntity(child);
      }
    }

    for (const child of this.hoistedEntities) {
      parseEntity(child);
    }
    
    return components;
  }

  public getComponentsOfType<T extends ComponentConstructor>(type: T) {
    type Instance = InstanceType<T>;
    const components = this.getComponents();
    const targets: Instance[] = [];
    for (const component of components) {
      if (component instanceof type) {
        targets.push(component as Instance);
      }
    }
    
    return targets;
  }

  public update() {
    const entities = [...this.entityInstances, ...this.instantiationRequests];
    for (const entity of entities) {
      const entityEventResolutions = this.getEventRequestsOf(entity);
      for (const eventResolution of entityEventResolutions) {
        this.eventRequests.set(...eventResolution);
      }
      
      entityEventResolutions.clear();
    }
    
    for (const [event, resolveEvent] of this.eventRequests) {
      this.handleEventResolution(event);
      resolveEvent();
    }

    this.eventRequests.clear();
    this.instantiationRequests.clear();
  }

  private handleEventResolution(event: Scene.Event) {
    switch(event.type) {
      case Scene.Event.Types.EntityInstatiation:
        this.hoistedEntities.add(event.target);
        this.entityInstances.add(event.target);
        break;

      case Scene.Event.Types.EntityTransfer:
        if (event.target.parent !== null && event.parent === null) {
          this.hoistedEntities.add(event.target);
        } else if (event.target.parent === null) {
          this.hoistedEntities.delete(event.target);
        }

        break;
      
      case Scene.Event.Types.EntityDestruction:
        this.entityInstances.delete(event.target);
        break;
    }
  }
}

export namespace Scene {
  export namespace Event {
    export enum Types {
      EntityInstatiation = 'EntityInstantiation',
      EntityTransfer = 'EntityTransfer',
      EntityDestruction = 'EntityDestruction',
    }

    interface EntityEvent<T extends Types> {
      readonly type: T;
      readonly target: Entity;
    }
  
    export interface EntityInstantiationEvent extends EntityEvent<Types.EntityInstatiation> {
      readonly parent?: Entity;
    }
    
    export interface EntityTransferEvent extends EntityEvent<Types.EntityTransfer> {
      readonly parent: Entity | null;
    }
    
    export interface EntityDestructionEvent extends EntityEvent<Types.EntityDestruction> {}
  }

  export type Event = 
    | Event.EntityInstantiationEvent 
    | Event.EntityTransferEvent 
    | Event.EntityDestructionEvent;
}