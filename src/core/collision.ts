import { Collider, Rigidbody } from "../components";
import { Entity } from "./entity";
import { Vector } from "./vector";

export class Collision<T extends Collider = Collider> {
  public readonly entity: Entity;

  constructor(public readonly collider: T) {
    this.entity = collider.entity;
  }
} 