import type { Entity } from "./entity";

export abstract class SimulationNode {
  public abstract name: string;
  protected parentNode: SimulationNode | null = null;
  protected children: Set<Entity> = new Set;

  protected getTopNode() {
    let node: SimulationNode = this;
    while(node.parentNode !== null) {
      node = node.parentNode;
    }

    return node;
  }
}