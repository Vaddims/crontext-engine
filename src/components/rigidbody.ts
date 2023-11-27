import { Color, Component, Entity, EntityTransform, Renderer, Space, Time } from "../core";
import { Collision } from "../core/collision";
import { Gizmos } from "../core/gizmos";
import { Vector } from "../core/vector";
import { Collider } from "./collider";
import { rotatedOffsetPosition } from "../utils";
import { Transformator } from "objectra";
import BuildinComponent from "../core/buildin-component";

@Transformator.Register()
export class Rigidbody extends BuildinComponent {
  private linearVelocity = Vector.zero;
  private angularVelocity = 0;

  public mass = 1;
  public inertia = 1;
  public restitution = 0;
  public staticFriction = 0.5;
  public dynamicFriction = 0.25;
  public spatialFriction = .0;

  public gizmosRenderVelocity = true;

  public [Component.onStart]() {
    this.inertia = this.calculateRotationalInertia();
  }

  [EntityTransform.onChange]() {
    // add when mass changes
    this.inertia = this.calculateRotationalInertia();
  }

  public [Component.onUpdate]() {
    this.linearVelocity = this.linearVelocity.multiply(Vector.one.subtract(this.spatialFriction))
    this.transform.translate(this.linearVelocity);
    this.transform.rotate(this.angularVelocity)
  }

  public [Component.onGizmosRender](gizmos: Gizmos) {
    gizmos.renderDirectionalLine(this.transform.position, this.linearVelocity.multiply(10), Color.red);
  }

  public addForce(force: Vector, space = Space.global) {
    let acceleration = Vector.zero;

    switch(space) {
      case Space.global:
        acceleration = force.divide(this.mass);
        break;

      case Space.local:
        acceleration = rotatedOffsetPosition(force, this.entity.transform.rotation);
        break;
    }

    this.linearVelocity = this.linearVelocity.add(acceleration);
  }

  @Transformator.Exclude()
  private cachedCollider: Collider | null | undefined;
  private get collider() {
    if (this.cachedCollider === void 0) {
      return this.cachedCollider = this.entity.components.findOfType(Collider);
    }

    return this.cachedCollider;
  }

  private get isStatic() {
    return this.collider?.isStatic ?? false;
  }

  public get invertedMass() {
    return this.isStatic ? 0 : 1 / this.mass;
  }

  public get invertedInertia() {
    return this.isStatic ? 0 : 1 / this.inertia;
  }

  public calculateRotationalInertia() {
    // ONLY RECTS
    return (1 / 12) * this.mass * (this.transform.scale.x ** 2 + this.transform.scale.y ** 2);
  }

  public [Collider.onCollision](collision: Collision) {
    const opponentEntity = collision.colliders[1].entity;
    const opponentRigidbody = opponentEntity.components.find(Rigidbody);

    const restitution = Math.min(this.restitution, opponentRigidbody?.restitution ?? this.restitution);
    const contactPoint = collision.contacts[1] ? Vector.avarage(collision.contacts[0], collision.contacts[1]) : collision.contacts[0];
    const staticFriction = opponentRigidbody ? Math.avarage(this.staticFriction, opponentRigidbody.staticFriction) : this.staticFriction;
    const dynamicFriction = opponentRigidbody ? Math.avarage(this.dynamicFriction, opponentRigidbody.dynamicFriction) : this.dynamicFriction;

    // Resolution impulses calculation
    const selfRelativeContactPoint = contactPoint.subtract(this.transform.position);
    const opponentRelativeContactPoint = contactPoint.subtract(opponentEntity.transform.position);

    const selfPerpendicularRelativeContactPoint = selfRelativeContactPoint.perpendicular();
    const opponentPerpendicularRelativeContactPoint = opponentRelativeContactPoint.perpendicular();

    const selfAngularLinearVelocity = selfPerpendicularRelativeContactPoint.multiply(this.angularVelocity);
    const opponentAngularLinearVelocity = opponentPerpendicularRelativeContactPoint.multiply(opponentRigidbody?.angularVelocity ?? 0);

    const opponentComposedVelocity = opponentRigidbody ? opponentRigidbody.linearVelocity.add(opponentAngularLinearVelocity) : Vector.zero;
    const selfComposedVelocity = this.linearVelocity.add(selfAngularLinearVelocity);
    const relativeVelocity = opponentComposedVelocity.subtract(selfComposedVelocity);

    const contactVelocityMagnitute = Vector.dot(relativeVelocity, collision.normal);

    if (contactVelocityMagnitute > 0) {
      return;
    }

    const selfPerpendicularContactDotNormal = Vector.dot(selfPerpendicularRelativeContactPoint, collision.normal);
    const opponentPerpendicularContactDotNormal = Vector.dot(opponentPerpendicularRelativeContactPoint, collision.normal);

    const selfInvertedMass = this.invertedMass;
    const opponentInvertedMass = opponentRigidbody?.invertedMass ?? 0;
    const selfInvertedInertia = this.invertedInertia;
    const opponentInvertedInertia = opponentRigidbody?.invertedInertia ?? 0;

    const impulseDenominator = selfInvertedMass + opponentInvertedMass + 
    ((selfPerpendicularContactDotNormal ** 2) * selfInvertedInertia) + 
    ((opponentPerpendicularContactDotNormal ** 2) * opponentInvertedInertia);

    const impulseMagnitude = (-(1 + restitution) * contactVelocityMagnitute) / impulseDenominator;
    const impulse = collision.normal.multiply(impulseMagnitude);

    // Impulse applience
    this.linearVelocity = this.linearVelocity.add(impulse.multiply(-1).multiply(selfInvertedMass));
    this.angularVelocity += -selfRelativeContactPoint.cross(impulse) * selfInvertedInertia;

    if (opponentRigidbody) {
      opponentRigidbody.linearVelocity = opponentRigidbody.linearVelocity.add(impulse.multiply(opponentInvertedMass));
      opponentRigidbody.angularVelocity += opponentRelativeContactPoint.cross(impulse) * opponentInvertedInertia;
    }

    if (restitution > 0) {
      return;
    }

    // Friction
    const relativeTangent = relativeVelocity.subtract(collision.normal.multiply(Vector.dot(relativeVelocity, collision.normal)))
    if (relativeTangent.isAlmostEqual(Vector.zero)) {
      return;
    }
    
    const tangent = relativeTangent.normalized;

    const selfPerpendicularContactDotTangent = Vector.dot(selfPerpendicularRelativeContactPoint, tangent);
    const opponentPerpendicularContactDotTangent = Vector.dot(opponentPerpendicularRelativeContactPoint, tangent);

    const frictionImpulseDenominator = selfInvertedMass + opponentInvertedMass + 
    (selfPerpendicularContactDotTangent ** 2) * selfInvertedInertia + 
    (opponentPerpendicularContactDotTangent ** 2) * opponentInvertedInertia;

    const tangentialFrictionImpulse = Vector.dot(opponentPerpendicularRelativeContactPoint, tangent) / frictionImpulseDenominator;

    let frictionImpulse: Vector;
    if (Math.abs(tangentialFrictionImpulse) <= impulseMagnitude * staticFriction) {
      frictionImpulse = tangent.multiply(tangentialFrictionImpulse);
    } else {
      frictionImpulse = tangent.multiply(-impulseMagnitude, dynamicFriction);
    }

    // Friction impulse applience
    this.linearVelocity = this.linearVelocity.add(frictionImpulse.multiply(-1, selfInvertedMass));
    this.angularVelocity += -selfRelativeContactPoint.cross(frictionImpulse) * selfInvertedInertia;

    if (opponentRigidbody) {
      opponentRigidbody.linearVelocity = opponentRigidbody.linearVelocity.add(frictionImpulse.multiply(opponentInvertedMass));
      opponentRigidbody.angularVelocity += opponentRelativeContactPoint.cross(frictionImpulse) * opponentInvertedInertia;
    }
  }
}