import { SimulationNode } from "./simulation-node";
import { Component, ComponentConstructor } from "./component";
import { Entity } from "./entity";

export class Scene extends SimulationNode {
  public name = 'Scene';

  [Symbol.iterator]() {
    return this.children.values();
  }

  public instantiate(entity: Entity) {
    entity.setParent(this);
    this.children.add(entity);
  }

  public getAllEntities() {
		const entities: Entity[] = [];
		function itirate(entity: Entity) {
			entities.push(entity);
			for (const child of entity.getChildren()) {
        itirate(child);
      }
		}

		for (const entity of this.children) {
      itirate(entity);
    }

    return entities;
  }

  public find(name: string) {
    for (const entity of this.getAllEntities()) {
      if (entity.name === name) {
        return entity;
      }
    }
  }

  public getAllComponents() {
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

    for (const child of this.children) {
      parseEntity(child);
    }
    
    return components;
  }

  public getAllComponentsOfType<T extends ComponentConstructor>(type: T) {
    type Instance = InstanceType<T>;
    const components = this.getAllComponents();
    const targets: Instance[] = [];
    for (const component of components) {
      if (component instanceof type) {
        targets.push(component as Instance);
      }
    }
    
    return targets;
  }
}