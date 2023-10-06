import { Transformator } from "objectra";
import { Component, Vector } from "../../core";
import { Time } from "../../core/time";
import { Gravity } from "../gravity";
import { Rigidbody } from "../rigidbody";

@Transformator.Register()
export class DirectionalGravity extends Gravity {
  public direction = Vector.zero;

  public [Component.onUpdate]() {
    const scene = this.entity.scene;

    if (!scene) {
      return;
    }

    const rigidbodies = scene.getComponentsOfType(Rigidbody);
    for (const rigidbody of rigidbodies) {
      if (rigidbody.entity === this.entity) {
        this.destroy();
        alert('Component Conflict: Gravity & Rigidbody. The gravity component will be destroyed')
        return;
      }

      if (rigidbody.entity.name === 'Player') {
        continue;
      }

      const normal = this.direction;
      const force = normal.multiply(this.gravitationalPull);
      rigidbody.addForce(force);
    }
  }
}