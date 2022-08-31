import { rotatedOffsetPosition } from "../utils/crontext-math";
import { Entity } from "./entity";
import { Space } from "./space";
import { Transform } from "./transform";
import { Vector } from "./vector";

export class EntityTransform {
  constructor(private readonly entity: Entity) {}

  private globalPosition = Vector.zero;
  private globalScale = Vector.one;
  private globalRotation = 0; 
  
  private dependedPosition = Vector.zero;
  private dependedScale = Vector.one;
  private dependedRotation = 0;

  public get position() {
    return this.globalPosition;
  }

  public set position(vector) {
    this.globalPosition = vector;
    this.updateRelativeLocalPosition();
  }

  public get scale() {
    return this.globalScale;
  }

  public set scale(vector) {
    this.globalScale = vector;
    this.updateRelativeLocalScale();
  }

  public get rotation() {
    return this.globalRotation;
  }

  public set rotation(radians) {
    this.globalRotation = radians;
    this.updateRelativeLocalRotation();
    this.updateRelativeLocalPosition();
  }

  public get angleRotation() {
    return this.globalRotation * 180 / Math.PI;
  }

  public set angleRotation(angles) {
    this.rotation = angles * Math.PI / 180;
  }

  public get localPosition() {
    return this.dependedPosition;
  }

  public set localPosition(vector) {
    this.dependedPosition = vector.duplicate();
    this.updateRelativePosition();
  }

  public get localScale() {
    return this.dependedScale;
  }
  
  public set localScale(vector) {
    this.dependedScale = vector.duplicate();
    this.updateRelativeScale();
  }
  
  public get localRotation() {
    return this.dependedRotation;
  }
  
  public set localRotation(radians) {
    this.dependedRotation = radians;
    this.updateRelativeRotation();
    this.updateRelativePosition();
  }
  
  public get localAngleRotation() {
    return this.dependedRotation * 180 / Math.PI;
  }
  
  public set localAngleRotation(angles) {
    this.localRotation = angles * Math.PI / 180;
  }
  
  public get parentTransform(): EntityTransform | null {
    return this.entity.parent?.transform ?? null;
  }

  public translate(dPosition: Vector, space = Space.global) {
    if (space === Space.global) {
      this.position = this.position.add(dPosition);
      return;
    }

    const position = rotatedOffsetPosition(dPosition, this.rotation);
    this.position = this.position.add(position);
  }

  public rotate(radians: number) {
    this.rotation = this.rotation + radians;
  }

  public lookAt(target: Vector, direction = Vector.up) {
    const axisRotationDifference = target.subtract(this.position).rotation();
    const directionAngle = Math.atan2(direction.y, direction.x);
    const directionFullAngle = directionAngle >= 0 ? directionAngle : directionAngle + Math.PI * 2;
    const angleDifference = axisRotationDifference - directionFullAngle;

    const fullRotationDifference = this.rotation % (Math.PI * 2);
    const difference = fullRotationDifference >= 0 ? 
      angleDifference - fullRotationDifference : 
      angleDifference - (Math.PI * 2 + fullRotationDifference);

    if (difference < -Math.PI && difference < Math.PI) {
      this.rotate(Math.PI * 2 + difference)
    } else if (difference > Math.PI && difference > -Math.PI) {
      this.rotate(-(Math.PI * 2 - difference))
    } else {
      this.rotate(difference);
    }
  }

  private getRelativePosition() {
    const parentTransform = this.parentTransform;
    const parentPosition = parentTransform?.position ?? Vector.zero;
    const parentScale = parentTransform?.scale ?? Vector.one;
    const parentRotation = parentTransform?.rotation ?? 0;

    const localPosition = rotatedOffsetPosition(this.dependedPosition, parentRotation);
    const position = parentPosition.add(localPosition.multiply(parentScale));
    return position;
  }

  private getRelativeScale() {
    const parentScale = this.parentTransform?.scale ?? Vector.one;
    const globalScale = this.dependedScale.multiply(parentScale);
    return globalScale;
  }

  private getRelativeRotation() {
    const parentRotation = this.parentTransform?.rotation ?? 0;
    const globalRotation = this.dependedRotation + parentRotation;
    return globalRotation;
  }

  private getRelativeLocalPosition() {
    const parentTransform = this.parentTransform;
    const parentPosition = parentTransform?.position ?? Vector.zero;
    const parentScale = parentTransform?.scale ?? Vector.one;
    const parentRotation = parentTransform?.rotation ?? 0;

    const localOffset = this.globalPosition.subtract(parentPosition);
    const { sin, cos } = Math;
    const { x, y } = localOffset;
    const axisStabilizer = new Vector(cos(-parentRotation), sin(-parentRotation));
    const horizontalOffset = new Vector(x * axisStabilizer.x, x * axisStabilizer.y).divide(parentScale);
    const verticalOffset = new Vector(-y * axisStabilizer.y, y * axisStabilizer.x).divide(parentScale);
    const localPosition = horizontalOffset.add(verticalOffset);
    return localPosition;
  }

  private getRelativeLocalScale() {
    const parentScale = this.parentTransform?.scale ?? Vector.one;
    const localScale = this.globalScale.divide(parentScale);
    return localScale;
  }

  private getRelativeLocalRotation() {
    const parentRotation = this.parentTransform?.rotation ?? 0;
    const localRotation = this.globalRotation - parentRotation;
    return localRotation;
  }

  private updateRelativePosition(preventProganation = false) {
    this.globalPosition = this.getRelativePosition();

    if (!preventProganation)
    for (const entity of this.entity.getChildren()) {
      entity.transform.updateRelativePosition();
    }
  }

  private updateRelativeScale(preventProganation = false) {
    this.globalScale = this.getRelativeScale();

    if (!preventProganation)
    for (const entity of this.entity.getChildren()) {
      entity.transform.updateRelativeScale();
    }
  }

  private updateRelativeRotation(preventProganation = false) {
    this.globalRotation = this.getRelativeRotation();

    if (!preventProganation)
    for (const entity of this.entity.getChildren()) {
      entity.transform.updateRelativeRotation();
    }
  }

  private updateRelativeLocalPosition(preventProganation = false) {
    this.localPosition = this.getRelativeLocalPosition();

    if (!preventProganation)
    for (const entity of this.entity.getChildren()) {
      entity.transform.updateRelativeLocalPosition();
    }
  }

  private updateRelativeLocalScale(preventProganation = false) {
    this.localScale = this.getRelativeLocalScale();

    if (!preventProganation)
    for (const entity of this.entity.getChildren()) {
      entity.transform.updateRelativeLocalScale();
    }
  }

  private updateRelativeLocalRotation(preventProganation = false) {
    this.localRotation = this.getRelativeLocalRotation();

    if (!preventProganation) for (const entity of this.entity.getChildren()) {
      entity.transform.updateRelativeLocalRotation();
    }
  }

  public updateRelativeTransform() {
    this.updateRelativeRotation(true);
    this.updateRelativeScale(true);
    this.updateRelativePosition(true);

    for (const entity of this.entity.getChildren()) {
      entity.transform.updateRelativeTransform();
    }
  }

  public updateRelativeLocalTransform() {
    this.updateRelativeLocalPosition(true);
    this.updateRelativeLocalRotation(true);
    this.updateRelativeLocalScale(true);

    for (const entity of this.entity.getChildren()) {
      entity.transform.updateRelativeLocalTransform();
    }
  }

  public toPureTransform() {
    const transform = new Transform(this.position, this.scale, this.rotation);
    return transform;
  }
}