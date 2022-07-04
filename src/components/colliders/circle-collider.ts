import { Color, Entity, Shape, Vector } from "../../core";
import { Collision } from "../../core/collision";
import { Gizmos } from "../../core/gizmos";
import { Circle } from "../../shapes";
import { Collider } from "../collider";
import { PlaneCollider } from "./plane-collider";
import { Rigidbody } from "../rigidbody";

export class CircleCollider extends Collider {
  public center = Vector.zero;
  public radius = 0.5;
  public readonly shape = new Circle();

  // public gizmosRender(gizmos: Gizmos) {
  //   gizmos.renderCircle(this.position, this.radius, Color.yellow);
  // }

  public collisionDetection<T extends Collider>(collider: T): Collision<T> | null {
    type CollisionDetectionResult = Collision<T> | null;

    if (collider instanceof CircleCollider) {
      return this.circleCollisionDetection(collider) as CollisionDetectionResult;
    }

    if (collider instanceof PlaneCollider) {
      return this.planeCollisionDetection(collider) as CollisionDetectionResult;
    }

    return null;
  }
 
  public circleCollisionDetection(collider: CircleCollider) {
    const radiusDistance = this.radius + collider.radius;
    const distanceMagnitude = collider.position.subtract(this.position).magnitude;

    if (radiusDistance > distanceMagnitude) {
      return new Collision(collider);
    }

    return null;
  }

  public planeCollisionDetection(collider: PlaneCollider) {
    const closestPoint = collider.closestPointToPoint(this.position);
    const offset = closestPoint.subtract(this.position);
    if (offset.magnitude <= this.radius) {
      return new Collision(collider);
    }

    return null;
  }

  public penetrationResolution(collider: Collider) {
    if (collider instanceof CircleCollider) {
      return this.circlePenetrationResolution(collider);
    }

    if (collider instanceof PlaneCollider) {
      return this.planePenetrationResolution(collider);
    }
  }

  public circlePenetrationResolution(collider: CircleCollider) {
    const distance = collider.position.subtract(this.position);
    const penetrationDepth = this.radius + collider.radius - distance.magnitude;
    const penetrationResolution = distance.normalized.multiply(penetrationDepth);
    this.transform.translate(penetrationResolution.multiply(Vector.reverse));
  }

  public planePenetrationResolution(collider: PlaneCollider) {
    const closestPoint = collider.closestPointToPoint(this.position);
    const penetrationVector = this.position.subtract(closestPoint);
    const penetrationDepth = this.radius - penetrationVector.magnitude;
    const penetrationResolution = penetrationVector.normalized.multiply(penetrationDepth);
    this.transform.translate(penetrationResolution);
  }

  public get position() {
    return this.transform.position.add(this.center);
  }
}