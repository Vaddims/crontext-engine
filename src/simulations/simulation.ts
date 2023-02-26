import { Component } from "../core";
import { Scene } from "../core/scene";
import { Objectra } from "objectra";

export enum SimulationUpdateState {
  Active, // Request new updates as time goes on
  Passive, // Resolving the remaining updates without creating new update requests
  Frozen, // All updates resolved
}

export class Simulation {
  public updateOnFrameChange = true;
  private loadedScene: Scene;
  private activeScene: Scene;
  private updateState = SimulationUpdateState.Frozen;
  
  constructor(scene = new Scene) {
    this.loadedScene = Objectra.duplicate(scene);
    this.activeScene = Objectra.duplicate(this.loadedScene);
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

  public start() {
    const { activeScene } = this;

    if (this.updateOnFrameChange) {
      const coldStart = this.updateState === SimulationUpdateState.Frozen;
      this.updateState = SimulationUpdateState.Active;
      if (coldStart) {
        activeScene.requestComponentActionEmission(Component.onStart, []);
        activeScene.update();
        requestAnimationFrame(this.update.bind(this));
      }
    }
  }
  
  public update() {
    if (this.updateState !== SimulationUpdateState.Active) {
      this.updateState = SimulationUpdateState.Frozen;
      return;
    }
    
    if (this.updateOnFrameChange) {
      requestAnimationFrame(this.update.bind(this));
    }
  }
  
  public stop() {
    if (this.updateState === SimulationUpdateState.Active) {
      this.updateState = SimulationUpdateState.Passive;
    }
  }

  public get isRunning() {
    return this.updateState === SimulationUpdateState.Active;
  }
}