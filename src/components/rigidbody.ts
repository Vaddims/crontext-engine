import { Color, Component, Entity, EntityTransform, Renderer, Space, Time } from "../core";
import { Collision } from "../core/collision";
import { Gizmos } from "../core/gizmos";
import { Vector } from "../core/vector";
import { CircleCollider } from "./colliders/circle-collider";
import { Collider } from "./collider";
import { PlaneCollider } from "./colliders/plane-collider";
import { rotatedOffsetPosition } from "../utils";
import { Transformator } from "objectra";
import BuildinComponent from "../core/buildin-component";

type ColliderConstructor = new (entity: Entity) => Collider;
type RigidbodyResolver<A extends Collider, B extends Collider> = 
  (rigidbody: Rigidbody, rigidbodyCollider: A, collisionCollider: B) => void;
type RigidbodyResolvers = [[ColliderConstructor, ColliderConstructor], RigidbodyResolver<any, any>][]; 

@Transformator.Register()
export class Rigidbody extends BuildinComponent {
  private linearVelocity = Vector.zero;
  private rotationalVelocity = 0;

  public inertia = 0;

  public spatialFriction = .0;

  public mass = 1;
  public area = 1;
  public density = 0;
  public restitution = 0;
  public staticFriction = 0.5;
  public dynamicFriction = 0.25;

  public gizmosRenderVelocity = true;
  public gizmosRenderAcceeleration = true;

  private readonly updateResolved: Rigidbody[] = [];

  public [Component.onStart]() {
    this.inertia = this.calculateRotationalInertia();
  }

  [EntityTransform.onChange]() {
    // add when mass changes
    this.inertia = this.calculateRotationalInertia();
  }

  frameResolvedWith = new Set<Entity>();
  public [Component.onUpdate]() {
    this.frameResolvedWith.clear();
    // this.updateResolved.length = 0;
    // this.velocity = this.velocity.add(this.acceleration);
    this.linearVelocity = this.linearVelocity.multiply(Vector.one.subtract(this.spatialFriction))
    this.transform.translate(this.linearVelocity);
    this.transform.rotate(this.rotationalVelocity)
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

  public getInvertedMass() {
    const collider = this.entity.components.findOfType(Collider);
    if (collider?.behaviour === Collider.Behaviour.Static) {
      return 0;
    }

    return 1 / this.mass;
  }

  public getInvertedInertia() {
    const collider = this.entity.components.findOfType(Collider);
    if (collider?.behaviour === Collider.Behaviour.Static) {
      return 0;
    }

    return 1 / this.inertia;
  }

  public resolveXCollision(rigidbody: Rigidbody, normal: Vector) {
    const relativeVelocity = rigidbody.linearVelocity.subtract(this.linearVelocity);
    const restitution = Math.min(this.restitution, rigidbody.restitution)

    const impulseNorminator = -(1 + restitution) * Vector.dot(relativeVelocity, normal);
    const impulseDivider = this.getInvertedMass() + rigidbody.getInvertedMass();
    const impulse = impulseNorminator / impulseDivider;

    this.linearVelocity = this.linearVelocity.subtract(normal.multiply(impulse / this.mass));
    rigidbody.linearVelocity = rigidbody.linearVelocity.add(normal.multiply(impulse / rigidbody.mass));
  }

  public calculateRotationalInertia() {
    // ONLY RECTS
    return (1 / 12) * this.mass * (this.transform.scale.x ** 2 + this.transform.scale.y ** 2);
  }

  public [Collider.onCollision](collision: Collision) {
    const opponentEntity = collision.colliders[1].entity;
    const opponentRigidbody = opponentEntity.components.find(Rigidbody);

    const restitution = Math.min(this.restitution, opponentRigidbody?.restitution ?? this.restitution);
    const contactPoint = collision.contacts[1] ? collision.contacts[1].add(collision.contacts[0]).divide(2) : collision.contacts[0];
    const staticFriction = (this.staticFriction + (opponentRigidbody?.staticFriction ?? this.staticFriction)) * .5;
    const dynamicFriction = (this.dynamicFriction + (opponentRigidbody?.dynamicFriction ?? this.dynamicFriction)) * .5;

    // Resolution impulses calculation
    const selfRelativeContactPoint = contactPoint.subtract(this.transform.position);
    const opponentRelativeContactPoint = contactPoint.subtract(opponentEntity.transform.position);

    const selfPerpendicularRelativeContactPoint = selfRelativeContactPoint.perpendicular();
    const opponentPerpendicularRelativeContactPoint = opponentRelativeContactPoint.perpendicular();

    const selfAngularLinearVelocity = selfPerpendicularRelativeContactPoint.multiply(this.rotationalVelocity);
    const opponentAngularLinearVelocity = opponentPerpendicularRelativeContactPoint.multiply(opponentRigidbody?.rotationalVelocity ?? 0);

    const opponentComposedVelocity = opponentRigidbody ? opponentRigidbody.linearVelocity.add(opponentAngularLinearVelocity) : Vector.zero;
    const selfComposedVelocity = this.linearVelocity.add(selfAngularLinearVelocity);
    const relativeVelocity = opponentComposedVelocity.subtract(selfComposedVelocity);

    const contactVelocityMagnitute = Vector.dot(relativeVelocity, collision.normal);

    if (contactVelocityMagnitute > 0) {
      return;
    }

    const selfPerpendicularContactDotNormal = Vector.dot(selfPerpendicularRelativeContactPoint, collision.normal);
    const opponentPerpendicularContactDotNormal = Vector.dot(opponentPerpendicularRelativeContactPoint, collision.normal);


    const selfInvertedMass = this.getInvertedMass();
    const opponentInvertedMass = opponentRigidbody?.getInvertedMass() ?? 0;
    const selfInvertedInertia = this.getInvertedInertia();
    const opponentInvertedInertia = opponentRigidbody?.getInvertedInertia() ?? 0;

    const impulseDenominator = selfInvertedMass + opponentInvertedMass + 
    ((selfPerpendicularContactDotNormal ** 2) * selfInvertedInertia) + 
    ((opponentPerpendicularContactDotNormal ** 2) * opponentInvertedInertia);

    const impulseMagnitude = (-(1 + restitution) * contactVelocityMagnitute) / impulseDenominator;
    const impulse = collision.normal.multiply(impulseMagnitude);

    // Impulse applience
    this.linearVelocity = this.linearVelocity.add(impulse.multiply(-1).multiply(selfInvertedMass));
    this.rotationalVelocity += -selfRelativeContactPoint.cross(impulse) * selfInvertedInertia;

    if (opponentRigidbody) {
      opponentRigidbody.linearVelocity = opponentRigidbody.linearVelocity.add(impulse.multiply(opponentRigidbody.getInvertedMass()));
      opponentRigidbody.rotationalVelocity += opponentRelativeContactPoint.cross(impulse) * opponentInvertedInertia;
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
    this.rotationalVelocity += -selfRelativeContactPoint.cross(frictionImpulse) * selfInvertedInertia;

    if (opponentRigidbody) {
      opponentRigidbody.linearVelocity = opponentRigidbody.linearVelocity.add(frictionImpulse.multiply(opponentRigidbody.getInvertedMass()));
      opponentRigidbody.rotationalVelocity += opponentRelativeContactPoint.cross(frictionImpulse) * opponentInvertedInertia;
    }
  }
}