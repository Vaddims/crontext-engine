import { Transformator } from "objectra";
import { rotatedOffsetPosition } from "../utils/crontext-math";
import { Entity } from "./entity";
import { Space } from "./space";
import { Transform } from "./transform";
import { Vector } from "./vector";
import type { Component } from "./component";
import { Scene } from "./scene";

@Transformator.Register()
export class EntityTransform {
  @Transformator.ConstructorArgument()
  public readonly entity: Entity;
  
  constructor(entity: Entity) {
    this.entity = entity;
  }

  @Transformator.Exclude()
  private cachedGlobalPosition: Vector | null = null;

  @Transformator.Exclude()
  private cachedGlobalScale: Vector | null = null;

  @Transformator.Exclude()
  private cachedGlobalRotation: number | null = null;

  private internalLocalPosition = Vector.zero;
  private internalLocalScale = Vector.one;
  private internalLocalRotation = 0;

  public emit<T extends Component.SignalMethod.Any>(
    actionSymbol: symbol
  ) {
    const { scene } = this.entity;
    if (!scene) {
      throw new Error();
    }

    return (...args: T extends Component.SignalMethod<infer A> ? A : []) => {
      const requestArguments = args ?? [];
      type ResultType = T extends Component.SignalMethod<any, infer U, any, any> ? U : never;
      return scene.emitSignal<typeof requestArguments, ResultType>(actionSymbol, {
        args: requestArguments,
        target: 1,
        initiator: this,
      });
    }
  }

  private handleTransformationChange() {
    this.emit(EntityTransform.onChange)();
    // this.entity.scene?.recacheEntitySpatialPartition(this.entity);
  }

  public get position() {
    if (this.cachedGlobalPosition) {
      return this.cachedGlobalPosition;
    }

    return this.cachedGlobalPosition = this.calculateGlobalPosition();
  }

  public set position(globalPosition: Vector) {
    const initialCachedGlobalPosition = this.cachedGlobalPosition;

    this.cachedGlobalPosition = globalPosition;
    this.internalLocalPosition = this.calculateLocalPosition(globalPosition);

    for (const entity of this.entity.getFlattenChildren()) {
      entity.transform.cachedGlobalPosition = null;
    }

    if (!initialCachedGlobalPosition || !initialCachedGlobalPosition.isEqual(this.cachedGlobalPosition)) {
      this.handleTransformationChange();
    }
  }

  public get localPosition() {
    return this.internalLocalPosition;
  }

  public set localPosition(localPosition: Vector) {
    const initialCachedLocalPosition = this.internalLocalPosition;

    this.cachedGlobalPosition = null;
    this.internalLocalPosition = localPosition;

    for (const entity of this.entity.getFlattenChildren()) {
      entity.transform.cachedGlobalPosition = null;
    }

    if (!initialCachedLocalPosition || !initialCachedLocalPosition.isEqual(this.internalLocalPosition)) {
      this.handleTransformationChange();
    }
  }
  
  private calculateGlobalPosition() {
    if (!this.entity.parent) {
      return this.internalLocalPosition;
    }

    const parentTransform = this.entity.parent.transform;
    const localPosition = rotatedOffsetPosition(this.localPosition.multiply(parentTransform.scale), parentTransform.rotation);
    const position = parentTransform.position.add(localPosition);
    return position;
  }

  private calculateLocalPosition(globalPosition: Vector) {
    if (!this.entity.parent) {
      return globalPosition;
    }

    const parentTransform = this.entity.parent.transform;
    const localOffset = globalPosition.subtract(parentTransform.position);
    const { sin, cos } = Math;
    const { x, y } = localOffset;
    const axisStabilizer = new Vector(cos(-parentTransform.rotation), sin(-parentTransform.rotation));
    const horizontalOffset = new Vector(x * axisStabilizer.x, x * axisStabilizer.y).divide(parentTransform.scale);
    const verticalOffset = new Vector(-y * axisStabilizer.y, y * axisStabilizer.x).divide(parentTransform.scale);
    const localPosition = horizontalOffset.add(verticalOffset);
    return localPosition;
  }

  public get scale() {
    if (this.cachedGlobalScale) {
      return this.cachedGlobalScale;
    }

    return this.cachedGlobalScale = this.calculateGlobalScale();
  }

  public set scale(globalScale: Vector) {
    const initialCachedScale = this.cachedGlobalScale;

    this.cachedGlobalScale = globalScale;
    this.internalLocalScale = this.calculateLocalScale(globalScale);

    for (const entity of this.entity.getFlattenChildren()) {
      entity.transform.cachedGlobalScale = null;
      entity.transform.cachedGlobalPosition = null;
    }

    if (!initialCachedScale || !initialCachedScale.isEqual(this.cachedGlobalScale)) {
      this.handleTransformationChange();
    }
  }

  public get localScale() {
    return this.internalLocalScale;
  }

  public set localScale(localScale: Vector) {
    const initialCachedlocalScale = this.cachedGlobalScale;
    this.internalLocalScale = localScale;
    this.cachedGlobalScale = null;

    for (const entity of this.entity.getFlattenChildren()) {
      entity.transform.cachedGlobalScale = null;
      entity.transform.cachedGlobalPosition = null;
    }

    if (!initialCachedlocalScale || !initialCachedlocalScale.isEqual(this.internalLocalScale)) {
      this.handleTransformationChange();
    }
  }

  public recache() {
    this.cachedGlobalPosition = null;
    this.cachedGlobalRotation = null;
    this.cachedGlobalScale = null;
  }

  public calibrateLocals() {
    this.position = this.internalLocalPosition;
    this.rotation = this.internalLocalRotation;
    this.scale = this.internalLocalScale;
  }

  public calibrateGlobals(transform: Transform) {
    this.position = transform.position;
    this.rotation = transform.rotation;
    this.scale = transform.scale;
  }

  private calculateGlobalScale() {
    return this.internalLocalScale;
  }

  private calculateLocalScale(globalScale: Vector) {
    return globalScale;
  }

  public get rotation() {
    if (this.cachedGlobalRotation !== null) {
      return this.cachedGlobalRotation;
    }

    return this.cachedGlobalRotation = this.calculateGlobalRotation();
  }

  public set rotation(rotation: number) {
    const initialCachedRotation = this.cachedGlobalRotation;

    this.cachedGlobalRotation = rotation;
    this.internalLocalRotation = this.calculateLocalRotation(rotation);

    for (const entity of this.entity.getFlattenChildren()) {
      entity.transform.cachedGlobalPosition = null;
      entity.transform.cachedGlobalRotation = null;
    }

    if (initialCachedRotation === null || initialCachedRotation !== rotation) {
      this.handleTransformationChange();
    }
  }

  public get localRotation() {
    return this.internalLocalRotation;
  }

  public set localRotation(localRotation: number) {
    const initialLocalRotation = this.internalLocalRotation;
    this.internalLocalRotation = localRotation;
    this.cachedGlobalRotation = null;

    for (const entity of this.entity.getFlattenChildren()) {
      entity.transform.cachedGlobalRotation = null;
      entity.transform.cachedGlobalPosition = null;
    }

    if (!initialLocalRotation || initialLocalRotation === this.internalLocalRotation) {
      this.handleTransformationChange();
    }
  }

  private calculateGlobalRotation() {
    if (!this.entity.parent) {
      return this.internalLocalRotation;
    }

    const parentTransform = this.entity.parent.transform;
    const globalRotation = this.internalLocalRotation + parentTransform.rotation;
    return globalRotation;
  }

  private calculateLocalRotation(globalRotation: number) {
    if (!this.entity.parent) {
      return globalRotation;
    }

    const localRotation = globalRotation - this.entity.parent.transform.rotation;
    return localRotation;
  }

  public get angleRotation() {
    return this.rotation * 180 / Math.PI;
  }

  public set angleRotation(angles) {
    this.rotation = angles * Math.PI / 180;
  }

  public get localAngleRotation() {
    return this.internalLocalRotation * 180 / Math.PI;
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

    // this.localPosition = this.localPosition.add(dPosition);
    const position = rotatedOffsetPosition(dPosition, this.rotation);
    this.position = this.position.add(position);
  }

  public rotate(radians: number) {
    this.rotation = this.rotation + radians;
  }

  public lookAt(target: Vector, direction = Vector.up) {
    const axisRotationDifference = target.subtract(this.position).rotation();
    this.rotation = axisRotationDifference;
    // const directionAngle = Math.atan2(direction.y, direction.x);
    // const directionFullAngle = directionAngle >= 0 ? directionAngle : directionAngle + Math.PI * 2;
    // const angleDifference = axisRotationDifference - directionFullAngle;

    // const fullRotationDifference = this.rotation % (Math.PI * 2);
    // const difference = fullRotationDifference >= 0 ? 
    //   angleDifference - fullRotationDifference : 
    //   angleDifference - (Math.PI * 2 + fullRotationDifference);

    // if (difference < -Math.PI && difference < Math.PI) {
    //   this.rotate(Math.PI * 2 + difference)
    // } else if (difference > Math.PI && difference > -Math.PI) {
    //   this.rotate(-(Math.PI * 2 - difference))
    // } else {
    //   this.rotate(difference);
    // }
  }

  public toPureTransform() {
    const transform = new Transform(this.position, this.scale, this.rotation);
    return transform;
  }

  public toPureLocalTransform() {
    const transform = new Transform(this.localPosition, this.localScale, this.localRotation);
    return transform;
  }

  public static readonly onChange = Symbol('ENTITYTRANFORM:ONCHANGE');
}