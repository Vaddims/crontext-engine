import { Collider, Rigidbody } from "../components";
import { nearestPointOnSegment } from "../utils";
import { Entity } from "./entity";
import { Shape } from "./shape";
import { Vector } from "./vector";

export class Collision<T extends Collider = Collider> {
  public readonly colliders: Collision.Colliders;
  public readonly contacts: Collision.Contacts;
  public readonly normal: Vector;
  public readonly depth: number;

  constructor(options: Collision.InitOptions) {
    this.colliders = options.colliders;
    this.contacts = Collision.findContactPoints(this.colliders[0].relativeShape(), this.colliders[1].relativeShape());
    this.normal = options.normal;
    this.depth = options.depth;
  }

  getIndexedData(index: 0 | 1) {
    return {
      collider: this.colliders[index],
      contacts: this.contacts,
    }
  }

  public static findContactPoints(...shapes: [Shape, Shape]) {
    const contacts: Collision.Contacts = [Vector.zero];

    let minDistanceSquared = Infinity;
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i];
      const opponentShape = shapes[1 - i];

      for (const vertex of shape.vertices) {
        for (const opponentShapeSegment of opponentShape.segments) {
          const { 
            distanceSquared, 
            nearestPoint 
          } = nearestPointOnSegment(vertex, opponentShapeSegment);
  
          const bias = 1e-10;
          if (Math.abs(distanceSquared - minDistanceSquared) < bias) {
            if (!nearestPoint.isAlmostEqual(contacts[0])) {
              contacts[1] = nearestPoint;
            }
          } else if (distanceSquared < minDistanceSquared) {
            minDistanceSquared = distanceSquared;
            contacts[0] = nearestPoint;
            contacts.length = 1;
          }
        }
      }
    }

    return contacts;
  }
} 

export namespace Collision {
  export type Colliders = [Collider, Collider];
  export type Contacts = [Vector, Vector?];

  export interface InitOptions {
    readonly colliders: Collision.Colliders;
    readonly normal: Vector,
    readonly depth: number;
  }
}