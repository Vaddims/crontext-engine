import { Collider, Rigidbody } from "../components";
import { pointSegmentDistance } from "../utils";
import { Entity } from "./entity";
import { Shape } from "./shape";
import { Vector } from "./vector";

export class Collision<T extends Collider = Collider> {
  public readonly colliders: Collision.Colliders;
  public readonly contacts: Collision.Contacts;
  public readonly contactQuantity: number;
  public readonly normal: Vector;
  public readonly depth: number;

  constructor(options: Collision.InitOptions) {
    this.colliders = options.colliders;
    const contact = Collision.findContactPoints(this.colliders[0].relativeShape(), this.colliders[1].relativeShape());
    this.contacts = contact.contacts;
    this.contactQuantity = contact.contactQuantity;
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
    let contactQuantity = 0;

    let minDistanceSquared = Infinity;
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i];
      const counterIndex = 1 - i;

      for (const vertex of shape.vertices) {
        for (const parallelShapeSegment of shapes[counterIndex].segments) {
          const { 
            distanceSquared, 
            contactPoint 
          } = pointSegmentDistance(vertex, parallelShapeSegment);
  
          const bias = 0.0005;
          if (Math.abs(distanceSquared - minDistanceSquared) < bias) {
            if (!contactPoint.isAlmostEqual(contacts[0], bias)) {
              contacts[1] = contactPoint;
              contactQuantity = 2;
            }
          } else if (distanceSquared < minDistanceSquared) {
            minDistanceSquared = distanceSquared;
            contactQuantity = 1;
            contacts[0] = contactPoint;
          }
        }
      }
    }

    return {
      contacts,
      contactQuantity,
    };
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