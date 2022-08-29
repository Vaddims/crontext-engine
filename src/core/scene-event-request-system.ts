import type { Entity } from "./entity";
import type { Scene } from "./scene";

export class SceneEventRequestSystem {
  protected readonly eventRequests = new Map<Scene.Event, Function>();
  protected getEventRequestsOf(sceneEventRequestSystem: SceneEventRequestSystem) {
    return sceneEventRequestSystem.eventRequests;
  }
}