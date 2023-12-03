import { Optic } from "../core/optic";
import { Simulation } from "./simulation";
import { Vector } from "../core/vector";
import {  Ray, Renderer, Shape, Space } from "../core";
import { Entity } from "../core/entity";
import { MeshRenderer } from "../components";
import { Circle, Rectangle } from "../shapes";
import { rotatedOffsetPosition } from "../utils";

export enum TransformMode {
  Position,
  Rotation,
  Scale,
}

export class SimulationInspector {
  public readonly optic = new Optic;
  public previousScale = 0;
  public scaleFactor = 0;
  public scaleStep = 5;

  public transformMode = TransformMode.Position;
  public transformSpace = Space.local;

  public usingControls = false;
  public controlDirection: Vector | null = null;

  public directionalAxisControlHorizontalSize = new Vector(1.75, .4);
  public axisControlSize = .6;

  public rotationalAxisControlBaseRadius = 3;
  public rotationalAxisControlPaddingArea = .5;

  public readonly selectedEntities = new Set<Entity>();

  public selectEntities(iterable: Iterable<Entity>) {
    this.selectedEntities.clear();
    for (const entity of iterable) {
      this.selectedEntities.add(entity);
    }

    this.inspectEntityChangeListeners.forEach((listener) => listener(this.getSelectedEntities()))
  }

  public getSelectedEntities() {
    return new Set(this.selectedEntities);
  }

  constructor(renderer: Renderer, public readonly simulation: Simulation) {
    this.optic.pixelsPerUnit = renderer.pixelsPerUnit;

    const opticScale = Math.exp(this.scaleFactor * this.scaleStep);
    this.optic.scale = Vector.one.multiply(opticScale);
  }

  private readonly inspectEntityChangeListeners = new Set<(entities: Set<Entity>) => void>();
  addInspectEntityChangeListener(callback: (entities: Set<Entity>) => void) {
    this.inspectEntityChangeListeners.add(callback);
  }

  removeInspectEntityChangeListener(callback: (entities: Set<Entity>) => void) {
    this.inspectEntityChangeListeners.delete(callback);
  }

  public transformAxisControlAreaFactory = (pivotPoint: Vector, controlRotation: number) => (axisDirection: Vector) => {
    const axisDirectionalScale = axisDirection.multiply(this.directionalAxisControlHorizontalSize.x);
    return new Rectangle()
      .withScale(this.optic.scale)
      .withScale(this.directionalAxisControlHorizontalSize)
      .withRotation(controlRotation + axisDirection.rotation())
      .withOffset(
        pivotPoint.add(
          rotatedOffsetPosition(axisDirectionalScale.multiply(this.optic.scale), controlRotation).divide(2)
        )
      )
  }

  public transformAxisControlRotationalAreaFactory(pivot: Vector) {
    return (radiusScale: number) => new Circle().withOffset(pivot).withScale(this.optic.scale.multiply(radiusScale));
  }

  public getInspectingEntitiesArithmeticPositionMean() {
    return Vector.arithemticMean(...[...this.selectedEntities].map(entity => entity.transform.position));
  }

  public getControlRotation() {
    switch(this.transformMode) {
      case TransformMode.Position: {
        if (this.selectedEntities.size === 1 && this.transformSpace === Space.local) {
          return [...this.selectedEntities][0].transform.rotation;
        }

        return 0;
      }

      case TransformMode.Scale: {
        if (this.selectedEntities.size === 1) {
          return [...this.selectedEntities][0].transform.rotation;
        }

        return 0;
      }

      case TransformMode.Rotation: {
        if (this.selectedEntities.size === 1) {
          return [...this.selectedEntities][0].transform.rotation;
        }

        return 0;
      }
    }
  }

  public defineDeltaControls(scenePosition: Vector) {
    const inspectEntityPositionsArithemticMean = Vector.arithemticMean(...[...this.selectedEntities].map(entity => entity.transform.position));
    const controlRotation = this.getControlRotation();

    const createAxisControlArea = this.transformAxisControlAreaFactory(inspectEntityPositionsArithemticMean, controlRotation);
    const xAxisControlArea = createAxisControlArea(Vector.right);
    const yAxisControlArea = createAxisControlArea(Vector.up);
    
    type ControlProjection = [Shape, Vector];
    
    const xAxisControlProjection: ControlProjection = [xAxisControlArea, Vector.right];
    const yAxisControlProjection: ControlProjection = [yAxisControlArea, Vector.up];
    
    const axisControlProjections = [xAxisControlProjection, yAxisControlProjection];

    switch(this.transformMode) {
      case TransformMode.Position:
      case TransformMode.Scale: {
        const axisControlArea = new Circle(this.axisControlSize / 2).withOffset(inspectEntityPositionsArithemticMean).withScale(this.optic.scale);
        const axisControlProjection: ControlProjection = [axisControlArea, Vector.one];

        const axisControlProjectionPriority = [axisControlProjection, ...axisControlProjections];
        for (const [controlArea, controlDirection] of axisControlProjectionPriority) {
          if (!Ray.isPointInsideShape(controlArea, scenePosition)) {
            continue;
          }

          this.usingControls = true;
          this.controlDirection = controlDirection;
          return;
        }

        break;
      }

      case TransformMode.Rotation: {
        const a = this.transformAxisControlRotationalAreaFactory(inspectEntityPositionsArithemticMean);
        const insideAxisControl = a(this.rotationalAxisControlBaseRadius - this.rotationalAxisControlPaddingArea);
        const outsideAxisControl = a(this.rotationalAxisControlBaseRadius + this.rotationalAxisControlPaddingArea);

        if (Ray.isPointInsideShape(outsideAxisControl, scenePosition) && !Ray.isPointInsideShape(insideAxisControl, scenePosition)) {
          this.usingControls = true;
        }

        break;
      }

      case TransformMode.Scale: {
        // const rectUp = new Rectangle().withOffset(s.transform.position.add(rotatedOffsetPosition(Vector.up, controlRotation).multiply(this.inspector.optic.scale))).withScale(
        //   new Vector(.2, 1.8).multiply(this.inspector.optic.scale)
        // ).withRotation(controlRotation);

        // const rectRight = new Rectangle().withOffset(
        //   s.transform.position.add(rotatedOffsetPosition(Vector.right, controlRotation).multiply(this.inspector.optic.scale))
        // ).withScale(
        //   new Vector(1.8, .2).multiply(this.inspector.optic.scale)
        // ).withRotation(controlRotation)

        // if (Ray.isPointInsideShape(rectUp, coords)) {
        //   this.clickedTransformControls = true;
        //   this.transformFace = Vector.up;
        // } else if (Ray.isPointInsideShape(rectRight, coords)) {
        //   this.clickedTransformControls = true;
        //   this.transformFace = Vector.right;
        // }
        break;
      }
    }
  }

  public applyDeltaControls(lastScenePosition: Vector, currentScenePosition: Vector) {
    if (this.selectedEntities.size === 0) {
      return;
    }

    const inspectEntityPositionsArithemticMean = Vector.arithemticMean(...[...this.selectedEntities].map(entity => entity.transform.position));
    const controlRotation = this.getControlRotation();
    const positionDifference = currentScenePosition.subtract(lastScenePosition);

    for (const entity of this.selectedEntities) {
      switch(this.transformMode) {
        case TransformMode.Position: {

          if (!this.controlDirection) {
            throw '';
          }
          
          if (this.controlDirection.isEqual(Vector.one)) {
            const controlDifference = this.controlDirection.multiply(positionDifference);
            entity.transform.translate(controlDifference);
          } else {
            const projection = Vector.projection(rotatedOffsetPosition(this.controlDirection, controlRotation), positionDifference);
            entity.transform.translate(projection);
          }

          break;
        }

        case TransformMode.Rotation: {
          const currentDxRotation = currentScenePosition.subtract(inspectEntityPositionsArithemticMean).rotation();
          const lastDxRotation = lastScenePosition.subtract(inspectEntityPositionsArithemticMean).rotation();

          const dxDifference = currentDxRotation - lastDxRotation;
          if (Math.abs(dxDifference) > Math.PI) {
            if (currentDxRotation < lastDxRotation) { // +
              const offsetedCurrentDxRotation = currentDxRotation + Math.PI * 2;
              const newDxDifference = offsetedCurrentDxRotation - lastDxRotation;
              entity.transform.rotation += newDxDifference;
            } else { // -
              const offsetedLastDxRotation = lastDxRotation + Math.PI * 2;
              const newDxDifference = currentDxRotation - offsetedLastDxRotation;
              entity.transform.rotation += newDxDifference;
            }
          } else {
            entity.transform.rotation += dxDifference;
          }

          break;
        }

        case TransformMode.Scale: {
          if (!this.controlDirection) {
            throw '';
          }

          const controlDifference = this.controlDirection.multiply(positionDifference.multiply(2))
          if (this.controlDirection.isEqual(Vector.one)) {
            entity.transform.scale = entity.transform.scale.add(rotatedOffsetPosition(controlDifference, -entity.transform.rotation));
          } else {
            entity.transform.scale = entity.transform.scale.add(controlDifference);
          }

          break;
        }
      }
    }
  }

  handleSceneClick(coordinates: Vector, altHandler: boolean) {
    const scene = this.simulation.scene;
    if (!scene) {
      return;
    }

    const ray = new Ray(coordinates, Vector.right);
    ray.entityShapeDriller = (entity) => {
      const vertices = entity.components.find(MeshRenderer)?.relativeVerticesPosition();
      if (!vertices) {
        return null;
      }

      return new Shape(vertices);
    }

    const resolutions = ray.research(scene);

    const stack = new Set<Entity>();
    for (const resolution of resolutions) {
      const { entity } = resolution;
      if (stack.has(entity)) {
        stack.delete(entity);
      } else {
        stack.add(entity);
      }
    }

    if (altHandler) {
      for (const entity of this.selectedEntities) {
        if (stack.has(entity)) {
          stack.delete(entity);
        } else {
          stack.add(entity);
        }
      }
    }

    this.selectEntities(stack);
  }

  setScale(scale: Vector) {
    this.optic.scale = scale;
    const opticScale = Math.log(scale.x);
    this.scaleFactor = opticScale / this.scaleStep;
  }

  handleOpticMovement(offset: Vector) {
    // const deltaMovement = new Vector(event.deltaX, event.deltaY).divide(window.devicePixelRatio);
    this.optic.scenePosition = this.optic.scenePosition.add(offset.multiply(Vector.reverseY, this.optic.scale).divide(20));
  }

  handleOpticScale(deltaScale: number, canvasSize: Vector, mousePosition: Vector) {
    const canvasCenter = canvasSize.divide(2);
    const cursorOffsetFromCenter = mousePosition.subtract(canvasCenter).multiply(Vector.reverseY);
    const offsetPriority = cursorOffsetFromCenter.divide(canvasCenter);

    const centerPriorityPixels = canvasCenter.multiply(offsetPriority);
    const stableUnitFit = centerPriorityPixels.divide(this.optic.scaledPixelsPerUnit());

    this.scaleFactor -= deltaScale;
    const opticScale = Math.exp(this.scaleFactor * this.scaleStep);
    this.optic.scale = Vector.one.multiply(opticScale);

    const freshUnitFit = centerPriorityPixels.divide(this.optic.scaledPixelsPerUnit());
    const deltaUnitFit = freshUnitFit.subtract(stableUnitFit);
    this.optic.scenePosition = this.optic.scenePosition.add(deltaUnitFit.multiply(Vector.reverse));
  }

  handleClick(event: MouseEvent, canvasCenter: Vector) {
    event.preventDefault();
    // const offset = new Vector(event.offsetX, event.offsetY).subtract(canvasCenter).multiply(Vector.reverseY);
    // const deltaMovement = offset.divide(window.devicePixelRatio);
    // this.optic.scenePosition = this.optic.scenePosition.add(deltaMovement.multiply(Vector.reverseY, this.optic.scale).divide(20));
    // const units = offset.divide(this.optic.scaledPixelsPerUnit()).add(this.optic.scenePosition);
  }


}