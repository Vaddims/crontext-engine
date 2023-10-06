import { Transformator } from "objectra";
import { Component, Vector } from "../../core";
import { Gravity } from "../gravity";
import { Rigidbody } from "../rigidbody";

@Transformator.Register()
export class PointGravity extends Gravity {
  public offset = Vector.zero;
  
  public [Component.onUpdate]() {
    const scene = this.entity.scene;

    if (!scene) {
      return;
    }

    const rigidbodies = scene.getComponentsOfType(Rigidbody);
    for (const rigidbody of rigidbodies) {
      if (rigidbody.entity === this.entity) {
        this.destroy();
        alert('Component Conflict: Gravity & Rigidbody. The rigidbody component will be destroyed')
        return;
      }

      const normal = this.transform.position.subtract(rigidbody.transform.position).normalized;
      const force = normal.multiply(this.gravitationalPull);
      rigidbody.addForce(force);
    }
  }
}