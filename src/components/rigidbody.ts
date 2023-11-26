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
    // console.log('Update rigidbody');
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

  public resolveCollision_ARCHIVEDANDWORKING(collision: Collision) {
    const {
      normal,
      colliders,
    } = collision;

    const externalCollision = colliders[1];
    const externalRigidbody = externalCollision.entity.components.find(Rigidbody);


    const relativeVelocity = (externalRigidbody?.linearVelocity ?? Vector.zero).subtract(this.linearVelocity);
    const restitution = Math.min(this.restitution, (externalRigidbody?.restitution ?? this.restitution));

    const impulseNorminator = -(1 + restitution) * Vector.dot(relativeVelocity, normal);
    const impulseDivider = this.getInvertedMass() + (externalRigidbody?.getInvertedMass() ?? 0);
    const impulse = impulseNorminator / impulseDivider;

    if (externalRigidbody) {
      externalRigidbody.linearVelocity = externalRigidbody.linearVelocity.add(normal.multiply(impulse / externalRigidbody.mass));
    }

    this.linearVelocity = this.linearVelocity.subtract(normal.multiply(impulse / this.mass));
  }

  public calculateRotationalInertia() {
    // ONLY RECTS
    return (1 / 12) * this.mass * (this.transform.scale.x ** 2 + this.transform.scale.y ** 2);
  }

  public [Collider.onCollision](collision: Collision) {
    const externalEntity = collision.colliders[1].entity;
    const externalRigidbody = externalEntity.components.find(Rigidbody);

    const restitution = Math.min(this.restitution, externalRigidbody?.restitution ?? this.restitution);

    const impulses: Vector[] = [];
    const raList = [];
    const rbList = [];

    for(let i = 0; i < collision.contactQuantity; i++) {
      impulses[i] = Vector.zero;
      raList[i] = Vector.zero;
      rbList[i] = Vector.zero;
    }

    for (let i = 0; i < collision.contactQuantity; i++) {
      const contactPoint = collision.contacts[i]!;

      const ra = contactPoint.subtract(this.transform.position);
      const rb = contactPoint.subtract(externalEntity.transform.position);

      raList[i] = ra;
      rbList[i] = rb;

      const raPerp = ra.perpendicular();
      const rbPerp = rb.perpendicular();

      const angularLinearVelocityA = raPerp.multiply(this.rotationalVelocity);
      const angularLinearVelocityB = rbPerp.multiply(externalRigidbody?.rotationalVelocity ?? 0);

      const externalRelativeVelocity = externalRigidbody ? externalRigidbody.linearVelocity.add(angularLinearVelocityB) : Vector.zero;
      const currentRelativeVelocity = this.linearVelocity.add(angularLinearVelocityA);
      const relativeVelocity = externalRelativeVelocity.subtract(currentRelativeVelocity);

      const contactVelocityMagnitute = Vector.dot(relativeVelocity, collision.normal);

      if (contactVelocityMagnitute > 0) {
        continue;
      }

      const raPerpDotN = Vector.dot(raPerp, collision.normal);
      const rbPerpDotN = Vector.dot(rbPerp, collision.normal);

      const denom = this.getInvertedMass() + (externalRigidbody?.getInvertedMass() ?? 0) + 
      (raPerpDotN ** 2) * this.getInvertedInertia() + 
      (rbPerpDotN ** 2) * (externalRigidbody?.getInvertedInertia() ?? 0);

      let j = -(1 + restitution) * contactVelocityMagnitute;
      j /= denom;

      const impulse = collision.normal.multiply(j);
      impulses[i] = impulse;
    }

    for (let i = 0; i < collision.contactQuantity; i++) {
      const impulse = impulses[i];

      const ra = raList[i];
      const rb = rbList[i];

      this.linearVelocity = this.linearVelocity.add(impulse.multiply(-1).multiply(this.getInvertedMass()));
      this.rotationalVelocity += -ra.cross(impulse) * this.getInvertedInertia();

      if (externalRigidbody) {
        externalRigidbody.linearVelocity = externalRigidbody.linearVelocity.add(impulse.multiply(externalRigidbody.getInvertedMass()));
        externalRigidbody.rotationalVelocity += rb.cross(impulse) * externalRigidbody.getInvertedInertia();
      }
    }
  }

}