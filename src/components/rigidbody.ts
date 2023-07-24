import { Color, Component, Entity, Renderer, Space } from "../core";
import { Collision } from "../core/collision";
import { Gizmos } from "../core/gizmos";
import { Vector } from "../core/vector";
import { CircleCollider } from "./colliders/circle-collider";
import { Collider } from "./collider";
import { PlaneCollider } from "./colliders/plane-collider";
import { rotatedOffsetPosition } from "../utils";

type ColliderConstructor = new (entity: Entity) => Collider;
type RigidbodyResolver<A extends Collider, B extends Collider> = 
  (rigidbody: Rigidbody, rigidbodyCollider: A, collisionCollider: B) => void;
type RigidbodyResolvers = [[ColliderConstructor, ColliderConstructor], RigidbodyResolver<any, any>][]; 

export class Rigidbody extends Component {
  public velocity = Vector.zero;
  public acceleration = Vector.zero;
  public elasticity = 1;
  public friction = 0.01;
  public mass = 1;

  public gizmosRenderVelocity = true;
  public gizmosRenderAcceeleration = true;

  private readonly updateResolved: Rigidbody[] = [];

  public [Component.onUpdate]() {
    this.updateResolved.length = 0;
    this.velocity = this.velocity.add(this.acceleration);
    this.velocity = this.velocity.multiply(Vector.one.subtract(this.friction))
    this.transform.translate(this.velocity);
  }

  private circleCollisionResolution(collision: Collision<CircleCollider>) {
    const collider = this.entity.components.get(CircleCollider);

    // const normal = collider.position.subtract(collision.collider.position).normalized;
    // const relativeVelocity = collision.rigidbody ? this.velocity.subtract(collision.rigidbody.velocity) : this.velocity.duplicate();
    // const seperateVelocity = Vector.dot(relativeVelocity, normal);
    // const smallestElasticity = collision.rigidbody ? Math.min(this.elasticity, collision.rigidbody.elasticity) : this.elasticity;
    // const newSeperateVelocity = -seperateVelocity * smallestElasticity;
    
    // const invertedMass = 1 / this.mass;
    // const velocitySeperateDifference = newSeperateVelocity - seperateVelocity;
    // const targetInvertedMass = collision.rigidbody ? 1 / collision.rigidbody.mass : 0;
    // const impulse = Math.abs(velocitySeperateDifference / (invertedMass + targetInvertedMass));
    // const impulseVector = normal.multiply(impulse);

    // this.velocity = this.velocity.add(impulseVector.multiply(invertedMass));
    // if (collision.rigidbody) {
    //   collision.rigidbody.velocity = collision.rigidbody.velocity.add(impulseVector.multiply(-1 / collision.rigidbody.mass));
    // }
  }

  private planeCollisionResponse(collision: Collision<PlaneCollider>) {
    const collider = this.entity.components.get(CircleCollider);

    const normal = collider.position.subtract(collision.collider.closestPointToPoint(collider.position)).normalized;
    const seperateVelocity = Vector.dot(this.velocity.duplicate(), normal);
    const newSeperateVelocity = -seperateVelocity * this.elasticity;
    const velocitySeperateDifference = seperateVelocity - newSeperateVelocity;
    this.velocity = this.velocity.add(normal.multiply(-velocitySeperateDifference));
  }

  onCollision(collision: Collision) {
   this.resolveCollision(collision);
  }

  resolveCollision(collision: Collision) {
    if (this.updateResolved) {
      return;
    }

    const thisCollider = this.entity.components.get(CircleCollider);
    const colliders = [thisCollider, collision.collider];

    for (const entry of Rigidbody.resolvers) {
      const [ keys, resolver ] = entry;
      
      type ColliderConstructors = [ColliderConstructor, ColliderConstructor];

      const colliderConstructors = colliders.map(collider => collider.constructor) as ColliderConstructors;
      if (!keys.includes(colliderConstructors[0]) || !keys.includes(colliderConstructors[1])) {
        continue;
      }

      resolver(this, thisCollider, collision.collider);
    }
  }

  public addForce(vector: Vector, space = Space.global) {
    if (space === Space.global) {
      this.velocity = this.velocity.add(vector);
      return;
    }

    this.velocity = this.velocity.add(rotatedOffsetPosition(vector, this.entity.transform.rotation));
  }

  public gizmosRender(gizmos: Gizmos) {
    // if (this.gizmosRenderVelocity) {
    //   gizmos.renderDirectionalLine(this.transform.position, this.velocity.multiply(10), Color.green);
    // }
    
    // if (this.gizmosRenderAcceeleration) {
    //   gizmos.renderDirectionalLine(this.transform.position, this.acceleration.normalized.multiply(1.5), Color.red);
    // }
  }

  private static readonly resolvers: RigidbodyResolvers = [];

  static setResolver<A extends ColliderConstructor, B extends ColliderConstructor>(
    collider1: A, collider2: B, detector: RigidbodyResolver<InstanceType<A>, InstanceType<B>>
  ) {
    Rigidbody.resolvers.push([[collider1, collider2], detector]);
  }

  static {
    Rigidbody.setResolver(CircleCollider, CircleCollider, (rb, rbCollider, collisionCollider) => {
      const collisionRb = collisionCollider.entity.components.find(Rigidbody);
    
      const normal = rbCollider.position.subtract(collisionCollider.position).normalized;
      const relativeVelocity = collisionRb ? rb.velocity.subtract(collisionRb.velocity) : rb.velocity;
      const seperateVelocity = Vector.dot(relativeVelocity, normal);
    
      const smallestElasticity = collisionRb ? Math.min(rb.elasticity, collisionRb.elasticity) : rb.elasticity;
      const newSeperateVelocity = -seperateVelocity * smallestElasticity;
    
      const invertedMass = 1 / rb.mass;
      const velocitySeperateDifference = newSeperateVelocity - seperateVelocity;
      const targetInvertedMass = collisionRb ? 1 / collisionRb.mass : 0;
      const impulse = Math.abs(velocitySeperateDifference / (invertedMass + targetInvertedMass));
      const impulseVector = normal.multiply(impulse);
    
      rb.velocity = rb.velocity.add(impulseVector.multiply(invertedMass));
      if (collisionRb) {
        collisionRb.velocity = collisionRb.velocity.add(impulseVector.multiply(-1 / collisionRb.mass));
        collisionRb.updateResolved.push(rb);
      }
    });
  }
}

// private circleCollisionResolution(collision: Collision<CircleCollider>) {
//   const collider = this.entity.components.get(CircleCollider);

//   const normal = collider.position.subtract(collision.collider.position).normalized;
//   const relativeVelocity = collision.rigidbody ? this.velocity.subtract(collision.rigidbody.velocity) : this.velocity.duplicate();
//   const seperateVelocity = Vector.dot(relativeVelocity, normal);
//   const smallestElasticity = collision.rigidbody ? Math.min(this.elasticity, collision.rigidbody.elasticity) : this.elasticity;
//   const newSeperateVelocity = -seperateVelocity * smallestElasticity;
  
//   const invertedMass = 1 / this.mass;
//   const velocitySeperateDifference = newSeperateVelocity - seperateVelocity;
//   const targetInvertedMass = collision.rigidbody ? 1 / collision.rigidbody.mass : 0;
//   const impulse = Math.abs(velocitySeperateDifference / (invertedMass + targetInvertedMass));
//   const impulseVector = normal.multiply(impulse);

//   this.velocity = this.velocity.add(impulseVector.multiply(invertedMass));
//   if (collision.rigidbody) {
//     collision.rigidbody.velocity = collision.rigidbody.velocity.add(impulseVector.multiply(-1 / collision.rigidbody.mass));
//   }
// }