import { Collider } from "../components";
import { Collision } from "./collision";
import { Vector } from "./vector";

interface DetailedCollisionEntityResolution<T extends Collider = Collider> {
  readonly index: number;
  readonly collider: T;
  readonly deltaPosition: Vector;
}

export class DetailedCollision<Colliders extends [Collider, Collider]> {
  public readonly activeResolution: DetailedCollisionEntityResolution<Colliders[number]>;
  public readonly passiveResolution: DetailedCollisionEntityResolution<Colliders[number]>;

  constructor(public readonly colliders: Colliders, public readonly initialColliderPositions: [Vector, Vector]) {
    const resolutions = colliders.map((collider, index) => ({
      index,
      collider,
      deltaPosition: this.getIndexedColliderTransformationDelta(index),
    }));

    if (resolutions[0].deltaPosition.magnitude >= resolutions[1].deltaPosition.magnitude) {
      [this.activeResolution, this.passiveResolution] = resolutions;
    } else {
      [this.passiveResolution, this.activeResolution] = resolutions;
    }
  }

  private getIndexedColliderTransformationDelta(index: number) {
    return this.colliders[index].entity.transform.position.subtract(this.initialColliderPositions[index]); 
  }

  public toCollision<T extends Colliders[number]>(collider: T) {
    return new Collision(collider);
  }
}