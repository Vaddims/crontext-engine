import { Transformator } from "objectra";
import { Color, Component, Entity, EntityTransform, Shape, Transform, Vector } from "../../core";
import { Collision } from "../../core/collision";
import { Gizmos } from "../../core/gizmos";
import { Rectangle } from "../../shapes";
import { lerp, perpendicularProjection, nearestPointOnSegment, segmentWithSegmentIntersection } from "../../utils";
import { Collider } from "../collider";
import { Rigidbody } from "../rigidbody";
import { MemoizationPlugin } from "../../core/cache/plugins/memoization.capl";

enum CacheKey {
  PCRVP = 'PolygonCollider:RelativeVerticesPosition',
}

@Transformator.Register()
export class PolygonCollider extends Collider {
  public readonly shape = new Rectangle();

  public [Component.onAwake]() {
    super[Component.onAwake]();
    this.entity.cacheManager.controller[CacheKey.PCRVP].setPlugin(new MemoizationPlugin(() => (
      this.shape.withTransform(Transform.setRotation(this.transform.rotation).setScale(this.transform.scale).setPosition(this.transform.position))
    )));
  }

  public overlaps(collider: PolygonCollider) {      
    const overlaps = this.relativeShape().overlaps(collider.relativeShape());
    return overlaps;
  }

  // TODO Cleanup those 2 methods
  public relativeVerticesPosition(): readonly Vector[] {
    return this.entity.cache[CacheKey.PCRVP];
  }

  public relativeShape() {
    return this.entity.cache[CacheKey.PCRVP];
  }

  public [Component.onCollisionUpdate]() {
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
    }
  
    for (const collision of collisions) {
      this.emit(Collider.onCollision)(collision);
      (collision.colliders[1] as PolygonCollider).acceptCollisionFromExternalCollider(collision);
    }

    this.cache.collisions = collisions;
  }

  public [Component.onGizmosRender](gizmos: Gizmos) {
    super[Component.onGizmosRender](gizmos);
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

    // for (const collision of this.cache.collisions) {
    //   gizmos.renderFixedDisk(collision.contacts[0], .1, Color.green);
    //   gizmos.renderFixedCircle(collision.contacts[0], .1, Color.black);
    //   if (collision.contacts[1]) {
    //     gizmos.renderFixedDisk(collision.contacts[1], .1, Color.green);
    //     gizmos.renderFixedCircle(collision.contacts[1], .1, Color.black);
    //   }
    // }
  }

  public [EntityTransform.onChange]() {
    super[EntityTransform.onChange]();
    delete this.entity.cache[CacheKey.PCRVP];
  }

  public acceptCollisionFromExternalCollider(externalCollision: Collision) {
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
}
