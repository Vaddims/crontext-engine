import { Collider } from "../components";
import { Collision } from "./collision";
import { Entity } from "./entity";
import { EntityTransform } from "./entity-transform";
import { Gizmos } from "./gizmos";

export abstract class Component {
  [key: string]: unknown;
  public readonly transform: EntityTransform;

  constructor(public readonly entity: Entity) {
    this.transform = entity.transform;
  }

  public awake?(): void;
  public start?(): void;
  public update?(): void;
  public fixedUpdate?(): void;
  public gizmosRender?(gizmos: Gizmos): void;
  public onCollision?(collision: Collision<Collider>): void;

  public static getBaseclassOf(componentConstructor: ComponentConstructor) {
    let constructor = componentConstructor;
    while (Object.getPrototypeOf(constructor.prototype).constructor !== Component) {
      constructor = Object.getPrototypeOf(constructor.prototype).constructor;
    }

    return constructor;
  }
}

export type ComponentConstructor<T extends Component = Component> = new (entity: Entity) => T;