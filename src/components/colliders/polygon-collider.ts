import { Transformator } from "objectra";
import { Color, Component, Entity, EntityTransform, Shape, Transform, Vector } from "../../core";
import { Collision } from "../../core/collision";
import { Gizmos } from "../../core/gizmos";
import { Rectangle } from "../../shapes";
import { lerp, perpendicularProjection, nearestPointOnSegment, segmentWithSegmentIntersection } from "../../utils";
import { Collider } from "../collider";
import { Rigidbody } from "../rigidbody";

@Transformator.Register()
export class PolygonCollider extends Collider {
  public readonly shape = new Rectangle();

  public overlaps(collider: PolygonCollider) {      
    const overlaps = this.relativeShape().overlaps(collider.relativeShape());
    return overlaps;
  }

  private uncachedRelativeVerticesPosition() {
    const transformedShape = this.shape.withTransform(Transform.setRotation(this.transform.rotation).setScale(this.transform.scale).setPosition(this.transform.position));
    return transformedShape;
  }

  public relativeVerticesPosition() {
    const cache = this.entity.establishCacheConnection<readonly Vector[]>('pcrvp');
    const value = cache.get();
    if (value) {
      return value;
    }

    const transformedShape = this.uncachedRelativeVerticesPosition();
    cache.set(transformedShape.vertices);
    return transformedShape.vertices;
  }

  public relativeShape() {
    return this.uncachedRelativeVerticesPosition();
  }

  colls: Collision[] = [];
  norm = Vector.zero;
  depth = 0;

  public [Component.onUpdate]() {
    // console.log('normal collider update')
  }

  public [Component.onCollisionUpdate]() {
    // console.log('Special collider update and execute');
    const scene = this.entity.scene!;
    const collisions: Collision[] = [];
    for (const entity of scene.getEntities()) {
      if (entity === this.entity) {
        continue;
      }

      const collider = entity.components.find(PolygonCollider);
      if (!collider) {
        continue;
      }

      const overlapResult = this.relativeShape().overlaps(collider.relativeShape());
      if (!overlapResult) {
        continue;
      }

      const correction = overlapResult.normal.multiply(overlapResult.depth);
      this.norm = overlapResult.normal;
      this.depth = overlapResult.depth;

      if (this.isStatic && collider.isStatic) {
        continue;
      } else if (this.isStatic) {
        collider.entity.transform.translate(correction);
      } else if (collider.isStatic) {
        this.entity.transform.translate(correction.multiply(-1));
      } else {
        const correction = overlapResult.normal.multiply(overlapResult.depth / 2);
        this.entity.transform.translate(correction.multiply(-1));
        collider.entity.transform.translate(correction);
      }

      // const cache = this.entity.establishCacheConnection<readonly Vector[]>('pcrvp');
      // cache.delete();

      const collision = new Collision({
        colliders: [this, collider],
        depth: overlapResult.depth,
        normal: overlapResult.normal,
      });

      collisions.push(collision);
      this.colls = collisions;
    }
  
    for (const collision of collisions) {
      this.emit(Collider.onCollision)(collision);
      (collision.colliders[1] as PolygonCollider).acceptCollisionFromExternalCollider(collision);
    }
  }

  acceptCollisionFromExternalCollider(externalCollision: Collision) {
    if (!externalCollision.colliders.includes(this)) {
      console.warn('No this collider in external collision colliders');
      return;
    }

    const collision = new Collision({
      colliders: (externalCollision.colliders[0] === this ? [...externalCollision.colliders] : [...externalCollision.colliders].reverse()) as Collision.Colliders,
      depth: externalCollision.depth,
      normal: externalCollision.normal.multiply(-1),
    })

    this.emit(Collider.onCollision)(collision);
  }

  [EntityTransform.onChange]() {
    const cache = this.entity.establishCacheConnection<readonly Vector[]>('pcrvp');
    cache.delete();
  }

  public [Component.onGizmosRender](gizmos: Gizmos) {
    const scene = this.entity.scene!;
    const colliderRelativeShape = this.relativeShape();
    const rShapeB = this.shape.bounds.withTransform(this.transform.toPureTransform().setRotation(0).setRotation(this.transform.rotation));

    gizmos.highlightVertices(colliderRelativeShape.vertices, Color.green);
    gizmos.useMask(colliderRelativeShape.vertices, () => {
      gizmos.renderLine(rShapeB.vertices[0], rShapeB.vertices[2], Color.green);
    });

    for (const entity of scene.getEntities()) {
      if (entity === this.entity) {
        continue;
      }

      const collider = entity.components.find(PolygonCollider);
      if (!collider) {
        continue;
      }

      gizmos.highlightVertices(this.relativeShape().vertices, Color.green);
      const overlaps = this.relativeShape().overlaps(collider.relativeShape());
      if (!overlaps) {
        continue;
      }
    }

    for (const collision of this.colls) {
      gizmos.renderFixedDisk(collision.contacts[0], .2, Color.red);
      gizmos.renderFixedCircle(collision.contacts[0], .2, Color.black);
      if (collision.contacts.length === 2) {
        gizmos.renderFixedDisk(collision.contacts[1]!, .2, Color.red);
        gizmos.renderFixedCircle(collision.contacts[1]!, .2, Color.black);
      }
    }

    this.colls = [];
  }
}

function getEdgeNormal(edgeStart: Vector, edgeEnd: Vector): Vector {
  const edgeVector = { x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y };
  return new Vector(-edgeVector.y, edgeVector.x);
}