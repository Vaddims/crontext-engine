import type { Simulation } from "../simulations";
import { Renderer } from "./renderer";

export class Engine {
  private static contextSimulation: Simulation | null;

  private static readonly registeredSimulations = new Set<Simulation>(); 
  private static readonly registeredRenderers = new Set<Renderer>();
  
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
}