import { Color, Entity, Vector } from "../../core";
import { Collision } from "../../core/collision";
import { Gizmos } from "../../core/gizmos";
import { rotatedOffsetPosition } from "../../utils";
import { CircleCollider } from "./circle-collider";
import { Collider } from "../collider";

export class PlaneCollider extends Collider {
  public center = Vector.zero;
  public localScale = Vector.one;
  public localRotation = 0;

  get position() {
    return this.transform.position.add(this.center);
  }

  get rotation() {
    return this.transform.rotation + this.localRotation;
  }

  get scale() {
    return this.transform.scale.multiply(this.localScale);
  }

  get startPoint() {
    const offset = this.scale.multiply(new Vector(0.5, 0));
    const rotatedVector = rotatedOffsetPosition(offset, this.rotation);
    return this.position.subtract(rotatedVector);
  }

  get endPoint() {
    const offset = this.scale.multiply(new Vector(0.5, 0));
    const rotatedVector = rotatedOffsetPosition(offset, this.rotation);
    return this.position.add(rotatedVector);
  }

  get normalized() {
    return this.endPoint.subtract(this.startPoint).normalized;
  }

  public closestPointToPoint(position: Vector) {
    const distanceToStart = this.startPoint.subtract(position);
    if (Vector.dot(this.normalized, distanceToStart) > 0) {
      return this.startPoint;
    }

    const distanceToEnd = position.subtract(this.endPoint);
    if (Vector.dot(this.normalized, distanceToEnd) > 0) {
      return this.endPoint;
    }

    const closestDistance = Vector.dot(this.normalized, distanceToStart);
    const closestVector = this.normalized.multiply(closestDistance);
    return this.startPoint.subtract(closestVector);
  }

  public collisionDetection<T extends Collider>(collider: T): Collision<T> | null {
    type CollisionDetectionResult = Collision<T> | null;

    if (collider instanceof CircleCollider) {
      return this.circleCollisionDetection(collider) as CollisionDetectionResult;
    }

    return null;
  }

  public circleCollisionDetection(collider: CircleCollider) {
    const closestPoint = this.closestPointToPoint(collider.position);
    const offset = closestPoint.subtract(collider.position);
    if (offset.magnitude <= collider.radius) {
      return new Collision(collider);
    }

    return null;
  }

  public penetrationResolution<T extends Collider>(collider: T): void {
    if (collider instanceof CircleCollider) {
      return this.circlePenetrationResolution(collider);
    }
  }

  public circlePenetrationResolution(collider: CircleCollider) {
    const closestPoint = this.closestPointToPoint(collider.position);
    const penetrationVector = closestPoint.subtract(collider.position);
    const penetrationDepth = collider.radius - penetrationVector.magnitude;
    const penetrationResolution = penetrationVector.normalized.multiply(penetrationDepth);
    this.transform.translate(penetrationResolution);
  }

  gizmosRender(gizmos: Gizmos) {
    const colliders = this.entity.scene!.getComponentsOfType(CircleCollider);
    for (const collider of colliders) {
      const vector = this.closestPointToPoint(collider.position);
      gizmos.renderLine(collider.position, vector, Color.red);
    }
  }
}