import { Component, Vector } from "../../core";
import { Time } from "../../core/time";
import { Gravity } from "../gravity";
import { Rigidbody } from "../rigidbody";

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
        throw new Error('Component Conflict: Gravity x Rigidbody (Forbidden match)')
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