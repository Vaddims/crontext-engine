import { CircleCollider, Collider, PlaneCollider } from "../../../components";
import { Entity } from "../../entity";

type ColliderConstructor = new (entity: Entity) => Collider;
type CollisionDetector<A extends Collider = any, B extends Collider = any> = (a: A, b: B) => boolean;
type CollisionDetectors = [[ColliderConstructor, ColliderConstructor], CollisionDetector][]; 

export class CollisionDetection {
  private static readonly detectors: CollisionDetectors = [];

  static detectFrom<Collider1 extends Collider, Collider2 extends Collider>(collider1: Collider1, collider2: Collider2) {
    const colliders = [collider1, collider2] as const;

    for (const entry of CollisionDetection.detectors) {
      const [ keys, detector ] = entry;

      type ColliderConstructors = [ColliderConstructor, ColliderConstructor];
      type DetectorReturnType = ReturnType<CollisionDetector<Collider1, Collider2>>;
      

      const colliderConstructors = colliders.map(collider => collider.constructor) as ColliderConstructors;
      //console.log(!keys.includes(colliderConstructors[0]) || !keys.includes(colliderConstructors[1]), 'false')
      if (!keys.includes(colliderConstructors[0]) || !keys.includes(colliderConstructors[1])) {
        continue;
      }

      //console.log(keys[0] === colliderConstructors[0], 'true for passthrought')
      if (keys[0] === colliderConstructors[0]) {
        return detector(...colliders) as DetectorReturnType;
      }

      //console.log(keys[0] === colliderConstructors[1], 'true for shuffle');
      return detector(collider2, collider1) as DetectorReturnType;
    }

    return false;
  }

  static set<A extends ColliderConstructor, B extends ColliderConstructor>(
    collider1: A, collider2: B, detector: CollisionDetector<InstanceType<A>, InstanceType<B>>
  ) {
    CollisionDetection.detectors.push([[collider1, collider2], detector]);
  }

  static {
    CollisionDetection.set(CircleCollider, CircleCollider, (circleCollider1, circleCollider2) => {
      const radiusDistance = circleCollider1.radius + circleCollider2.radius;
      const distanceMagnitude = circleCollider2.position.subtract(circleCollider1.position).magnitude;

      return distanceMagnitude < radiusDistance;
    });

    CollisionDetection.set(CircleCollider, PlaneCollider, (circleCollider, planeCollider) => {
      const closestPointFromCircleCollider = planeCollider.closestPointToPoint(circleCollider.position);
      const offset = closestPointFromCircleCollider.subtract(circleCollider.position);
      return offset.magnitude < circleCollider.radius;
    });
  }
}