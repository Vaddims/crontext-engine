import { Color, Component, Shape, Transform, Vector } from "../../core";
import { Collision } from "../../core/collision";
import { Gizmos } from "../../core/gizmos";
import { Rectangle } from "../../shapes";
import { lerp, pointSegmentDistance } from "../../utils";
import { Collider } from "../collider";
import { Rigidbody } from "../rigidbody";

export class PolygonCollider extends Collider {
  public readonly shape = new Rectangle();

  public overlaps(collider: PolygonCollider) {      
    const overlaps = this.relativeShape().overlaps(collider.relativeShape());
    return overlaps;
  }

  public relativeVerticesPosition() {
    const transformedShape = this.shape.withTransform(Transform.setRotation(this.transform.rotation).setScale(this.transform.scale));
    return transformedShape.vertices.map(vertex => vertex.add(this.transform.position))
  }

  public relativeShape() {
    return new Shape(this.relativeVerticesPosition());
  }

  colls: Collision[] = [];
  public [Component.onUpdate]() {
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

      const collision = new Collision({
        colliders: [this, collider],
        depth: overlapResult.depth,
        normal: overlapResult.normal,
      });

      collisions.push(collision);
      this.colls = collisions;

      // const rb = collider.entity.components.find(Rigidbody);
      // this.entity.components.find(Rigidbody)?.resolveCollision(overlapResult.normal, rb ?? undefined);
    }
  
    for (const collision of collisions) {
      this.entity.components.find(Rigidbody)?.resolveCollision(collision);
    }


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
      gizmos.renderFixedDisk(collision.contacts[0], .1, Color.green);
      gizmos.renderFixedCircle(collision.contacts[0], .1, Color.black);
      if (collision.contacts[1]) {
        gizmos.renderFixedDisk(collision.contacts[1], .1, Color.green);
        gizmos.renderFixedCircle(collision.contacts[1], .1, Color.black);
      }
    }

    this.colls = [];


  }
}

function getEdgeNormal(edgeStart: Vector, edgeEnd: Vector): Vector {
  const edgeVector = { x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y };
  return new Vector(-edgeVector.y, edgeVector.x);
}