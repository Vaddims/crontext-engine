import { Color, Component, Shape, Vector } from "../core";
import { Collision } from "../core/collision";
import { Gizmos } from "../core/gizmos";
import { Rectangle } from "../shapes";

export interface Collider {
  collisionDetection<T extends Collider>(collider: T): Collision<T> | null;
  penetrationResolution<T extends Collider>(collider: T): void;
  get position(): Vector;
}

export class Collider extends Component implements Collider {
  public shape: Shape = new Rectangle();
  public isTrigger = false;

  gizmosRender(gizmos: Gizmos) {
    const { vertices } = this.shape;
    for (let i = 0; i < vertices.length; i++) {
      const vertex = vertices[i];
      const nextVertex = i === vertices.length - 1 ? vertices[0] : vertices[i + 1];
      gizmos.renderLine(vertex.add(this.position), nextVertex.add(this.position), Color.yellow);
    }
  }

  public relativeVerticesPosition() {
    const transformedShape = this.shape.withTransform(this.transform.rotation, this.transform.scale);
    return transformedShape.vertices.map(vertex => vertex.add(this.transform.position))
  }
}