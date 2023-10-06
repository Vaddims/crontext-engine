import { Constructor } from "objectra/dist/types/util.types";
import type { Simulation } from "../simulations";
import { Renderer } from "./renderer";
import { Component } from "./component";
import { Transformator } from "objectra";

export class Engine {
  public static fps: number = NaN;
  private static contextSimulation: Simulation | null;

  private static readonly registeredSimulations = new Set<Simulation>(); 
  private static readonly registeredRenderers = new Set<Renderer>();

  public static getInheritedConstructors(constructor: Constructor) {
    const componentConstructors = [...Transformator.getTransformatorsOfSuperConstructor(constructor)];
    return componentConstructors;
  }
  
  public static get simulations() {
    return [...Engine.registeredSimulations];
  }

  public static get renderers() {
    return [...Engine.registeredRenderers];
  }

  public static getRunningSimulations() {
    return Engine.simulations.filter(simulation => simulation.isRunning);
  }

  public static getCanvasRenderer(canvas: HTMLCanvasElement) {
    return Engine.renderers.find(renderer => renderer.canvas === canvas);
  }

  public static init() {
    Engine.updateTick();
  }

  public static updateTick() {
    const a = performance.now();
    for (const renderer of Engine.renderers) {
      renderer.updateTick();
    }

    const b = performance.now();
    Engine.fps = 1000 / (b - a);

    requestAnimationFrame(Engine.updateTick);
  }

  static {
    Engine.init();
  }
}