import { Transformator } from "objectra";
import { Component, EntityTransform, Transform, Vector } from "../core";
import { Color } from "../core/color";
import { Shape } from "../core/shape";
import { Rectangle } from "../shapes/rectangle";
import BuildinComponent from "../core/buildin-component";
import { RestoreCacheOnUpdatePlugin } from "../core/systems/cache-plugins/restore-cache-update.capl";
import { MemoizationOnSimulationUpdatePlugin } from "../core/systems/cache-plugins/memoization-simulation-update.capl";

enum CacheKey {
  RVP = 'relativeVerticesPosition',
}

@Transformator.Register()
export class MeshRenderer extends BuildinComponent {
  public shape: Shape = new Rectangle();
  public color: Color = Color.black;

  [Component.onAwake]() {
    this.cacheManager.controller[CacheKey.RVP].setPlugin(new MemoizationOnSimulationUpdatePlugin(() => (
      this.shape.withTransform(Transform.setRotation(this.transform.rotation).setScale(this.transform.scale).setPosition(this.transform.position))
    )));
  }

  [EntityTransform.onChange]() {
    delete this.cache[CacheKey.RVP];
  }

  public relativeVerticesPosition() {
    return (<Shape>this.cache[CacheKey.RVP]).vertices;
  }
}
