import { CircleCollider, Collider } from "../../../components";
import { DetailedCollision } from "../../detailed-collision";
import { Entity } from "../../entity";
import { Vector } from "../../vector";

type ColliderConstructor = new (entity: Entity) => Collider;
type CollisionResolver<T extends Collider = Collider> = (collision: CollisionRoleState<T>) => void;
type CollisionResolvers = [[ColliderConstructor, ColliderConstructor], CollisionResolver][]; 

export interface CollisionState<T extends Collider> {
  collider: T;
  deltaPosition: Vector;
}

export interface CollisionRoleState<T extends Collider> {
  colliders: [T, T];
  active: CollisionState<T>;
  passive: CollisionState<T>;
}

export class CollisionPenetrationResolution {
  public static readonly resolvers: CollisionResolvers = [];

  static resolve(collisionRoleState: CollisionRoleState<any>) {
    const { colliders } = collisionRoleState;

    for (const entry of CollisionPenetrationResolution.resolvers) {
      const [ keys, resolver ] = entry;

      type ColliderConstructors = [ColliderConstructor, ColliderConstructor];
      type DetectorReturnType = ReturnType<CollisionResolver>;

      const colliderConstructors = colliders.map(collider => collider.constructor) as ColliderConstructors;
      if (!keys.includes(colliderConstructors[0]) || !keys.includes(colliderConstructors[1])) {
        return;
      }

      if (keys[0] === colliderConstructors[0]) {
        return resolver(collisionRoleState) as DetectorReturnType;
      }

      return resolver(collisionRoleState) as DetectorReturnType;
    }
  }

  static set<A extends ColliderConstructor, B extends ColliderConstructor>(
    collider1: A, collider2: B, resolver: CollisionResolver<InstanceType<A> | InstanceType<B>>
  ) {
    CollisionPenetrationResolution.resolvers.push([[collider1, collider2], resolver as CollisionResolver<Collider>]);
  }

  static {
    CollisionPenetrationResolution.set(CircleCollider, CircleCollider, (roleState) => {
      const { active, passive } = roleState;

      const distance = active.collider.position.subtract(passive.collider.position);
      const penetrationDepth = active.collider.radius + passive.collider.radius - distance.magnitude;
      
      if (distance.isEqual(Vector.zero)) {
        const randomVector = Vector.random.normalized;
        const penetrationResolution = randomVector.multiply(penetrationDepth).divide(2);
        active.collider.transform.translate(penetrationResolution);
        passive.collider.transform.translate(penetrationResolution.multiply(Vector.reverse));
        return;
      }
      
      const penetrationResolution = distance.normalized.multiply(penetrationDepth);
      if (active.deltaPosition.magnitude === 0) {
        active.collider.transform.translate(penetrationResolution.divide(2));
        passive.collider.transform.translate(penetrationResolution.divide(2).multiply(Vector.reverse));
        return;
      }

      const passiveColliderMultiplier = passive.deltaPosition.magnitude / active.deltaPosition.magnitude;
      const activeColliderMultiplier = 1 - passiveColliderMultiplier;

      active.collider.transform.translate(penetrationResolution.multiply(activeColliderMultiplier));
      passive.collider.transform.translate(penetrationResolution.multiply(passiveColliderMultiplier, Vector.reverse));
    });
  }
}