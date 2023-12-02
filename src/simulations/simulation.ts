import { Component, Input, Renderer } from "../core";
import { Scene, Signal } from "../core/scene";
import { Objectra } from "objectra";
import { Engine } from "../core/engine";
import { Time } from "../core/time";

export enum SimulationUpdateState {
  Active, // Request new updates as time goes on
  Passive, // Resolving the remaining updates without creating new update requests
  Frozen, // All updates resolved and stopped
}

export class Simulation {
  public interimUpdateQuantity = 1;

  public updateOnFrameChange = true;
  public updatesPerSecond = 60;
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
    const initialState = this.updateState;
    this.forceStop();
    this.loadedScene = Objectra.duplicate(scene);
    this.activeScene = Objectra.duplicate(this.loadedScene);
    if (initialState === SimulationUpdateState.Active) {
      this.start();
    }
    
    this.activeScene.emitSignal(Component.onAwake, {
      target: Signal.Emission.ExecutionLevel.Broadcast,
    }).resolve();

    return this.activeScene;
  }

  public reloadScene() {
    this.activeScene = Objectra.duplicate(this.loadedScene);
    return this.activeScene;
  }

  updateTick() {
    this.scene['resolveSignals']();
    if (this.updateState === SimulationUpdateState.Frozen) {
      return;
    }

    this.update();
  }

  public start() {
    const { activeScene } = this;

    Engine['contextSimulation'] = this;

    const coldStart = this.updateState === SimulationUpdateState.Frozen;
    this.updateState = SimulationUpdateState.Active;
    if (coldStart) {
      activeScene.emitSignal(Component.onStart, {
        target: Signal.Emission.ExecutionLevel.Broadcast,
      }).resolve();
      
      activeScene.start();
    }

    Engine['contextSimulation'] = null;
  }
  
  public update() {
    if (this.updateState !== SimulationUpdateState.Active) {
      this.updateState = SimulationUpdateState.Frozen;
      return;
    }

    Engine['contextSimulation'] = this;

    Input.emitStaged(this);
    this.scene.emitSignal(Component.onInternalUpdate);
    this.scene.emitSignal(Component.onUpdate);
    this.scene.emitSignal(Component.onCollisionUpdate);
    this.scene.update();

    Engine['contextSimulation'] = null;
  }
  
  public stop() {
    if (this.updateState === SimulationUpdateState.Active) {
      this.updateState = SimulationUpdateState.Passive;
    }
  }

  public forceStop() {
    this.updateState = SimulationUpdateState.Frozen;
  }

  public get isRunning() {
    return this.updateState === SimulationUpdateState.Active;
  }

  public addSceneListener() {

  }
}