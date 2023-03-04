import type { Simulation } from "../simulations";

export class Engine {
  private static readonly registeredSimulations = new Set<Simulation>(); 
  
  public static get simulations() {
    return [...Engine.registeredSimulations];
  }

  public static getRunningSimulations() {
    return Engine.simulations.filter(simulation => simulation.isRunning);
  }
}