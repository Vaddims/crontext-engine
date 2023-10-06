import { Component, Input, Renderer } from "../core";
import { Scene } from "../core/scene";
import { Objectra } from "objectra";
import { Engine } from "../core/engine";
import { Time } from "../core/time";

export enum SimulationUpdateState {
  Active, // Request new updates as time goes on
  Passive, // Resolving the remaining updates without creating new update requests
  Frozen, // All updates resolved
}

export class Simulation {
  public interimUpdateQuantity = 1;

  public updateOnFrameChange = true;
  private loadedScene: Scene;
  private activeScene: Scene;
  private updateState = SimulationUpdateState.Frozen;
  
  constructor(public readonly renderer: Renderer) {
    this.loadedScene = Objectra.duplicate(new Scene());
    this.activeScene = Objectra.duplicate(this.loadedScene);
    Engine['registeredSimulations'].add(this);
  }

  public get scene() {
    return this.activeScene;
  }

  public loadScene(scene: Scene) {
    this.stop();
    this.loadedScene = Objectra.duplicate(scene);
    this.activeScene = Objectra.duplicate(this.loadedScene);
    return this.activeScene;
  }

  public reloadScene() {
    this.activeScene = Objectra.duplicate(this.loadedScene);
    return this.activeScene;
  }

  updateTick() {
    if (this.updateState === SimulationUpdateState.Frozen) {
      return;
    }

    if (this.updateOnFrameChange) {
      this.update();
    }
  }

  public start() {
    const { activeScene } = this;

    if (this.updateOnFrameChange) {
      const coldStart = this.updateState === SimulationUpdateState.Frozen;
      this.updateState = SimulationUpdateState.Active;
      if (coldStart) {
        activeScene.requestComponentActionEmission(Component.onStart, {
          target: Scene.ActionRequests.ActionEmission.ExecutionLevels.Broadcast,
        });

        activeScene.start();
      }
    }

    this.activeScene.recacheSpatialPartition();
  }
  
  public update() {
    if (this.updateState !== SimulationUpdateState.Active) {
      this.updateState = SimulationUpdateState.Frozen;
      return;
    }

    Engine['contextSimulation'] = this;

    for (let update = 0; update < this.interimUpdateQuantity; update++) {
      Input.emitStaged(this);
      this.scene.requestComponentActionEmission(Component.onUpdate);
      this.scene.update();
    }

    Engine['contextSimulation'] = null;
  }
  
  public stop() {
    if (this.updateState === SimulationUpdateState.Active) {
      this.updateState = SimulationUpdateState.Passive;
    }
  }

  public get isRunning() {
    return this.updateState === SimulationUpdateState.Active;
  }

  public addSceneListener() {

  }
}