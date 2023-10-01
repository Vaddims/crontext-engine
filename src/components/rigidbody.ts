import { Color, Component, Entity, Renderer, Space, Time } from "../core";
import { Collision } from "../core/collision";
import { Gizmos } from "../core/gizmos";
import { Vector } from "../core/vector";
import { CircleCollider } from "./colliders/circle-collider";
import { Collider } from "./collider";
import { PlaneCollider } from "./colliders/plane-collider";
import { rotatedOffsetPosition } from "../utils";
import { Transformator } from "objectra";

type ColliderConstructor = new (entity: Entity) => Collider;
type RigidbodyResolver<A extends Collider, B extends Collider> = 
  (rigidbody: Rigidbody, rigidbodyCollider: A, collisionCollider: B) => void;
type RigidbodyResolvers = [[ColliderConstructor, ColliderConstructor], RigidbodyResolver<any, any>][]; 

@Transformator.Register()
export class Rigidbody extends Component {
  private linearVelocity = Vector.zero;
  private rotationalVelocity = 0;

  public spatialFriction = .0;

  public mass = 1;
  public area = 1;
  public density = 0;
  public restitution = .5;

  public gizmosRenderVelocity = true;
  public gizmosRenderAcceeleration = true;

  private readonly updateResolved: Rigidbody[] = [];

  public [Component.onUpdate]() {
    // this.updateResolved.length = 0;
    // this.velocity = this.velocity.add(this.acceleration);
    this.linearVelocity = this.linearVelocity.multiply(Vector.one.subtract(this.spatialFriction))
    this.transform.translate(this.linearVelocity.multiply(Time.updateDelta));
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

  public resolveXCollision(rigidbody: Rigidbody, normal: Vector) {
    const relativeVelocity = rigidbody.linearVelocity.subtract(this.linearVelocity);
    const restitution = Math.min(this.restitution, rigidbody.restitution)

    const impulseNorminator = -(1 + restitution) * Vector.dot(relativeVelocity, normal);
    const impulseDivider = this.getInvertedMass() + rigidbody.getInvertedMass();
    const impulse = impulseNorminator / impulseDivider;

    this.linearVelocity = this.linearVelocity.subtract(normal.multiply(impulse / this.mass));
    rigidbody.linearVelocity = rigidbody.linearVelocity.add(normal.multiply(impulse / rigidbody.mass));
  }

  public resolveCollision(collision: Collision) {
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
}
