import { Transformator } from "objectra";
import { Color, Component, Shape, Transform, Vector } from "../core";
import { Collision } from "../core/collision";
import { Gizmos } from "../core/gizmos";
import { Rectangle } from "../shapes";
import type { CircleCollider } from "./colliders/circle-collider";

export interface Collider {
  collisionDetection<T extends Collider>(collider: T): Collision<T> | null;
  penetrationResolution<T extends Collider>(collider: T): void;
  get position(): Vector;
}

@Transformator.Register()
@Component.Abstract()
export class Collider extends Component implements Collider {
  public shape: Shape = new Rectangle();
  public behaviour = Collider.Behaviour.Dynamic;

  public get isDynamic() {
    return this.behaviour === Collider.Behaviour.Dynamic;
  }

  public get isTrigger() {
    return this.behaviour === Collider.Behaviour.Trigger;
  }

  public get isStatic() {
    return this.behaviour === Collider.Behaviour.Static;
  }

  public relativeVerticesPosition() {
    const transformedShape = this.shape.withTransform(Transform.setRotation(this.transform.rotation).setScale(this.transform.scale));
    return transformedShape.vertices.map(vertex => vertex.add(this.transform.position))
  }

  public relativeShape() {
    return new Shape(this.relativeVerticesPosition());
  }

  static circleIntersect(circleA: CircleCollider, circleB: CircleCollider) {
    const distance = Vector.distance(circleA.position, circleB.position);
    const radii = circleA.scaledRadius + circleB.scaledRadius;

    // console.log(distance)
    if (distance >= radii) {
      return null;
    }

    const positionNormal = circleB.position.subtract(circleA.position).normalized;
    const penetrationDepth = radii - distance;

    return {
      positionNormal,
      penetrationDepth,
    }
  }

  // public static 
}


export namespace Collider {
  export enum Behaviour {
    Dynamic,
    Trigger,
    Static,
  }
}