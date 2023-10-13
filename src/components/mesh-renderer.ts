import { Transformator } from "objectra";
import { Component, EntityTransform, Transform, Vector } from "../core";
import { Color } from "../core/color";
import { Shape } from "../core/shape";
import { Rectangle } from "../shapes/rectangle";
import BuildinComponent from "../core/buildin-component";

@Transformator.Register()
export class MeshRenderer extends BuildinComponent {
  public shape: Shape = new Rectangle();
  public color: Color = Color.black;

  public relativeVerticesPosition() {
    const cache = this.entity.establishCacheConnection<readonly Vector[]>('mrrvp');
    const value = cache.get();
    if (value) {
      return value;
    }

    const transformedShape = this.shape.withTransform(Transform.setRotation(this.transform.rotation).setScale(this.transform.scale).setPosition(this.transform.position));
    cache.set(transformedShape.vertices);
    return transformedShape.vertices;
  }

  [Component.onUpdate]() {
    const cache = this.entity.establishCacheConnection<readonly Vector[]>('mrrvp');
    cache.delete();
  }

  [EntityTransform.onChange]() {
    const cache = this.entity.establishCacheConnection<readonly Vector[]>('mrrvp');
    cache.delete();
  }
}
