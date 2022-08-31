import { SceneEventRequestSystem } from "./scene-event-request-system";
import { EntityTransform } from "./entity-transform";
import { Scene } from "./scene";
import { EntityComponentSystem } from "./systems/entity-component-system";
import { EntityLayerSystem } from "./systems/entity-layer-system";

export class Entity extends SceneEventRequestSystem {
  public name = "Entity";
  
  private parentScene: Scene | null = null;
  private parentEntity: Entity | null = null;

  public readonly components = new EntityComponentSystem(this);
  public readonly transform = new EntityTransform(this);
  public readonly layers = new EntityLayerSystem();
  protected readonly children = new Set<Entity>();

  public get scene() {
    return this.parentScene;
  }

  public get parent() {
    return this.parentEntity;
  }

  public get isHoisted() { // Hoisted in scene (top level entity)
    return this.scene && !this.parent;
  }

  public getChildren() {
    return [...this.children];
  }

  public async setParent(parent: Entity | null) {
    this.createTransferEventRequest(parent);
  }

  public async destroy() {
    await this.createDestructionEventRequest();
  }

  private requestEventResolve(event: Scene.Event, resolver: Function) {
    return new Promise<void>((resolve) => {
      this.eventRequests.set(event, () => {
        resolver();
        resolve(void 0);
      });
    });
  }

  private setParentLocally(parent: Entity | null) {
    this.parentEntity = parent;
  }

  private async createInstantiationEventRequest(scene: Scene) {
    const event: Scene.Event.EntityInstantiationEvent = {
      type: Scene.Event.Types.EntityInstatiation,
      target: this,
    };

    const resolver = () => {
      this.parentScene = scene;
    }

    return this.requestEventResolve(event, resolver);
  }

  private async createTransferEventRequest(newParent: Entity | null) {
    const initialPosition = this.transform.position;
    const event: Scene.Event.EntityTransferEvent = {
      type: Scene.Event.Types.EntityTransfer,
      target: this,
      parent: newParent,
    };

    const resolver = () => {
      this.parent?.children.delete(this);
      this.parentEntity = newParent;

      if (newParent) {
        newParent.children.add(this);
      }
      
      this.transform.position = this.transform.position;
      this.transform.updateRelativeLocalTransform();
    }

    return this.requestEventResolve(event, resolver);
  }

  private async createDestructionEventRequest() {
    const event: Scene.Event.EntityDestructionEvent = {
      type: Scene.Event.Types.EntityDestruction,
      target: this,
    };

    const resolver = () => {
      this.parent?.children.delete(this);
      this.parentEntity = null;
      this.parentScene = null;
    }

    return this.requestEventResolve(event, resolver);
  }

  private destroyLocally() {
    this.parent?.children.delete(this);
    this.parentEntity = null;
  }
}