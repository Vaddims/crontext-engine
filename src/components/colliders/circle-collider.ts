import { Color, Component, Entity, Shape, Transform, Vector } from "../../core";
import { Collision } from "../../core/collision";
import { Gizmos } from "../../core/gizmos";
import { Circle, Rectangle } from "../../shapes";
import { Collider } from "../collider";
import { PlaneCollider } from "./plane-collider";
import { Rigidbody } from "../rigidbody";

export class CircleCollider extends Collider {
  public center = Vector.zero;
  public radius = 0.5;
  public readonly shape = new Circle();

  public get position() {
    return this.transform.position.add(this.center);
  }

  public get scaledRadius() {
    return Math.max(this.transform.scale.x, this.transform.scale.y) * this.radius;
  };

  public get scale() {
    return this.transform.scale.multiply(this.radius);
  }

  public [Component.onGizmosRender](gizmos: Gizmos) {
    const fullCircle = Math.PI * 2
    const topRotation = fullCircle * (1.5/4) + this.transform.rotation;
    const bottomRotation = fullCircle * (3.5/4) + this.transform.rotation;

    gizmos.renderCircle(this.position, this.scaledRadius, Color.green);
    gizmos.renderLine(
      this.position.add(Vector.fromAngle(topRotation).multiply(this.scaledRadius)), 
      this.position.add(Vector.fromAngle(bottomRotation).multiply(this.scaledRadius)), 
      Color.green,
    );
  }

  public [Component.onUpdate]() {
    const scene = this.entity.scene!;
    const entities =  scene.getEntities();
    for (const entity of entities) {
      if (entity === this.entity) {
        continue;
      }

      const collider = entity.components.find(CircleCollider);
      if (!collider) {
        continue;
      }

      const intersection = Collider.circleIntersect(this, collider);

      if (!intersection) {
        continue;
      }

      let intersectionNormal = intersection.positionNormal;
      if (intersectionNormal.isEqual(Vector.zero)) {
        intersectionNormal = Vector.random();
      }

      this.transform.translate(intersectionNormal.multiply(-1, intersection.penetrationDepth, 0.5));
      collider.entity.transform.translate(intersectionNormal.multiply(intersection.penetrationDepth, 0.5));
    }

  }
}

// public collisionDetection<T extends Collider>(collider: T): Collision<T> | null {
//   type CollisionDetectionResult = Collision<T> | null;

//   if (collider instanceof CircleCollider) {
//     return this.circleCollisionDetection(collider) as CollisionDetectionResult;
//   }

//   if (collider instanceof PlaneCollider) {
//     return this.planeCollisionDetection(collider) as CollisionDetectionResult;
//   }

//   return null;
// }

// public circleCollisionDetection(collider: CircleCollider) {
//   const radiusDistance = this.radius + collider.radius;
//   const distanceMagnitude = collider.position.subtract(this.position).magnitude;

//   if (radiusDistance > distanceMagnitude) {
//     return new Collision(collider);
//   }

//   return null;
// }

// public planeCollisionDetection(collider: PlaneCollider) {
//   const closestPoint = collider.closestPointToPoint(this.position);
//   const offset = closestPoint.subtract(this.position);
//   if (offset.magnitude <= this.radius) {
//     return new Collision(collider);
//   }

//   return null;
// }

// public penetrationResolution(collider: Collider) {
//   if (collider instanceof CircleCollider) {
//     return this.circlePenetrationResolution(collider);
//   }

//   if (collider instanceof PlaneCollider) {
//     return this.planePenetrationResolution(collider);
//   }
// }

// public circlePenetrationResolution(collider: CircleCollider) {
//   const distance = collider.position.subtract(this.position);
//   const penetrationDepth = this.radius + collider.radius - distance.magnitude;
//   const penetrationResolution = distance.normalized.multiply(penetrationDepth);
//   this.transform.translate(penetrationResolution.multiply(Vector.reverse));
// }

// public planePenetrationResolution(collider: PlaneCollider) {
//   const closestPoint = collider.closestPointToPoint(this.position);
//   const penetrationVector = this.position.subtract(closestPoint);
//   const penetrationDepth = this.radius - penetrationVector.magnitude;
//   const penetrationResolution = penetrationVector.normalized.multiply(penetrationDepth);
//   this.transform.translate(penetrationResolution);
// }