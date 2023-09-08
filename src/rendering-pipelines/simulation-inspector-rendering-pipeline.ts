import { MeshRenderer } from "../components/mesh-renderer";
import { RenderingPipeline, Transform } from "../core";
import { Optic } from "../core/optic";
import { Shape } from "../core/shape";
import { SimulationInspectorRenderer } from "../renderers/simulation-inspector-renderer";
import { Vector } from "../core/vector";
import { SimulationRenderingPipeline } from "./simulation-rendering-pipeline";
import { Camera } from "../components/camera";
import { Rectangle } from "../shapes/rectangle";
import { Entity } from "../core/entity";
import { Space } from "../core/space";
import { Color } from "../core/color";
import { rotatedOffsetPosition } from "../utils/crontext-math";
import { Triangle } from "../shapes/triangle";
import { Circle, IcocelesTriangle } from "../shapes";
import { Simulation, SimulationInspector, TransformMode } from "../simulations";

interface TransformControlColorPalette {
  readonly main: Color;
  readonly outline: Color;
}

export class SimulationInspectorRenderingPipeline extends SimulationRenderingPipeline<SimulationInspectorRenderer> {
  public readonly transformControl = {
    lineWidthScalar: .3,
    showUsableAreas: false,
    colorPalette: {
      omnidirectional: {
        main: new Color(75, 75, 255),
        outline: new Color(0, 0, 200),
      },
      horizontal: {
        main: Color.red,
        outline: new Color(200, 0, 0),
      },
      vertical: {
        main: Color.green,
        outline: new Color(0, 200, 0),
      },
      usableControlArea: {
        main: Color.transparent,
        outline: Color.yellow,
      }
    }
  }

  renderMeshMarkup(canvasSize: Vector) {
    const { context } = this;
    const divider = 10 ** (Math.ceil(Math.log10(this.optic.scale.x) - .5));
    const gridUnitSize = divider * this.optic.scaledPixelsPerUnit().x;
    const canvasCenter = canvasSize.divide(2);
    const falcumRenderingPosition = this.optic.scenePosition.multiply(this.optic.scaledPixelsPerUnit());

    context.save();
    context.globalAlpha = .75;

    // x line
    context.beginPath();
    context.moveTo(-canvasCenter.x, falcumRenderingPosition.y);
    context.lineTo(canvasCenter.x, falcumRenderingPosition.y);
    context.closePath();
    context.stroke();

    // y line
    context.beginPath();
    context.moveTo(-falcumRenderingPosition.x, -canvasCenter.y);
    context.lineTo(-falcumRenderingPosition.x, canvasCenter.y);
    context.closePath();
    context.stroke();

    context.restore();
  }

  public defineFixedShapePath(shape: Shape) {
    const { context } = this;

    context.beginPath();
    const { vertices } = shape.withScale(this.optic.pixelsPerUnit);
    for (let i = 0; i < vertices.length; i++) {
      // const vertex = vertices[i].multiply(this.optic.pixelsPerUnit);
      const vertex = vertices[i];
      if (i === 0) {
        context.moveTo(vertex.x, -vertex.y);
        continue;
      }
      context.lineTo(vertex.x, -vertex.y);
    }
    context.closePath();
  }

  public createDirectionalShape(inspector: SimulationInspector, axisDirection: Vector, horizontalAlignedHeadScale: Vector) {
    const headRightDirectionSize = inspector.directionalAxisControlHorizontalSize.y * horizontalAlignedHeadScale.x;
    const transformControlsRightUnitSize = new Vector(inspector.directionalAxisControlHorizontalSize.x - headRightDirectionSize, inspector.directionalAxisControlHorizontalSize.y * this.transformControl.lineWidthScalar);
    const controlRotation = inspector.getControlRotation();
    const position = inspector.getInspectingEntitiesArithmeticPositionMean();

    const axisDirectionalScale = axisDirection.multiply(transformControlsRightUnitSize.x);
    return new Rectangle()
      .withScale(this.optic.scale)
      .withScale(transformControlsRightUnitSize)
      .withRotation(controlRotation + axisDirection.rotation())
      .withOffset(
        position.add(
          rotatedOffsetPosition(axisDirectionalScale.multiply(this.optic.scale), controlRotation).divide(2)
        )
      )
  }

  public createDirectionalHeadShape(inspector: SimulationInspector, shape: Shape, axisDirection: Vector, horizontalAlignedHeadScale: Vector) {
    const position = inspector.getInspectingEntitiesArithmeticPositionMean();
    const controlRotation = inspector.getControlRotation();
    const headRightDirectionSize = inspector.directionalAxisControlHorizontalSize.y * horizontalAlignedHeadScale.x;

    const triangleAxisDirectionalScale = axisDirection.multiply(inspector.directionalAxisControlHorizontalSize.x - (headRightDirectionSize / 2));
    return shape
      .withScale(this.optic.scale)
      .withScale(horizontalAlignedHeadScale.multiply(inspector.directionalAxisControlHorizontalSize.y).swap()) //headRightScale.multiply(inspector.directionalAxisControlRightSize.y))
      .withRotation(controlRotation + axisDirection.rotation() - Math.PI / 2)
      .withOffset(        
        position.add(
          rotatedOffsetPosition(triangleAxisDirectionalScale.multiply(this.optic.scale), controlRotation)
        )
      )
  }

  public renderEntityTransformPositionControl(inspector: SimulationInspector) {
    const { colorPalette } = this.transformControl;
    const horizontalAlignedHeadScale = new Vector(1.5, 1);

    const position = inspector.getInspectingEntitiesArithmeticPositionMean();
    const controlRotation = inspector.getControlRotation()

    const renderTransformAxis = (axisDirection: Vector, controlColorPalette: TransformControlColorPalette) => {
      const directionalShape = this.createDirectionalShape(inspector, axisDirection, horizontalAlignedHeadScale);
      const headShape = this.createDirectionalHeadShape(inspector, new IcocelesTriangle(), axisDirection, horizontalAlignedHeadScale);

      this.renderShape(directionalShape, Vector.zero, 0, controlColorPalette.main);
      this.renderShape(headShape, Vector.zero, 0, controlColorPalette.main);

      this.outlineShape(directionalShape, controlColorPalette.outline);
      this.outlineShape(headShape, controlColorPalette.outline)
    }

    renderTransformAxis(Vector.right, colorPalette.horizontal);
    renderTransformAxis(Vector.up, colorPalette.vertical);

    this.renderFixedDisk(position, .3, colorPalette.omnidirectional.main);
    this.renderFixedCircle(position, .3, colorPalette.omnidirectional.outline)

    if (this.transformControl.showUsableAreas) {
      const createControlArea = inspector.transformAxisControlAreaFactory(position, controlRotation);
      this.outlineShape(createControlArea(Vector.up), colorPalette.usableControlArea.outline);
      this.outlineShape(createControlArea(Vector.right), colorPalette.usableControlArea.outline);
    }
  }

  public renderEntityTransformRotationControls(inspector: SimulationInspector) {
    const { colorPalette } = this.transformControl;
    const position = inspector.getInspectingEntitiesArithmeticPositionMean();
    const controlRotation = inspector.getControlRotation();
    const circleRadius = 1.5;
    const lineWidth = 5;
    const controlAxisIndicatorScalar = .4;

    this.renderFixedCircle(position, circleRadius, new Color(75, 75, 255), lineWidth);
    const renderDirectionalLine = (direction: Vector, color: Color) => {
      const pivot = position.add(
        rotatedOffsetPosition(direction.multiply(circleRadius - controlAxisIndicatorScalar / 2).multiply(this.optic.scale), controlRotation)
      );

      const lineDirection = rotatedOffsetPosition(direction.multiply(controlAxisIndicatorScalar), controlRotation);
      this.renderFixedDirectionalLine(pivot, lineDirection, color, lineWidth)
    }

    renderDirectionalLine(Vector.right, colorPalette.horizontal.main)
    renderDirectionalLine(Vector.up, colorPalette.vertical.main);
    
    if (this.transformControl.showUsableAreas) {
      const createControlArea = inspector.transformAxisControlRotationalAreaFactory(position);
      this.outlineShape(createControlArea(inspector.rotationalAxisControlBaseRadius - inspector.rotationalAxisControlPaddingArea), colorPalette.usableControlArea.outline);
      this.outlineShape(createControlArea(inspector.rotationalAxisControlBaseRadius + inspector.rotationalAxisControlPaddingArea), colorPalette.usableControlArea.outline);
    }
  }

  public renderEntityTransformScaleControls(inspector: SimulationInspector) {
    const { colorPalette } = this.transformControl;
    const horizontalAlignedHeadScale = new Vector(1, 1);

    const position = inspector.getInspectingEntitiesArithmeticPositionMean();
    const controlRotation = inspector.getControlRotation()

    const renderTransformAxis = (axisDirection: Vector, controlColorPalette: TransformControlColorPalette) => {
      const directionalShape = this.createDirectionalShape(inspector, axisDirection, horizontalAlignedHeadScale);
      const headShape = this.createDirectionalHeadShape(inspector, new Rectangle(), axisDirection, horizontalAlignedHeadScale);

      this.renderShape(directionalShape, Vector.zero, 0, controlColorPalette.main);
      this.renderShape(headShape, Vector.zero, 0, controlColorPalette.main);

      this.outlineShape(directionalShape, controlColorPalette.outline);
      this.outlineShape(headShape, controlColorPalette.outline)
    }

    renderTransformAxis(Vector.right, colorPalette.horizontal);
    renderTransformAxis(Vector.up, colorPalette.vertical);

    this.renderFixedDisk(position, .3, colorPalette.omnidirectional.main);
    this.renderFixedCircle(position, .3, colorPalette.omnidirectional.outline)


    if (this.transformControl.showUsableAreas) {
      const createControlArea = inspector.transformAxisControlAreaFactory(position, controlRotation);
      this.outlineShape(createControlArea(Vector.up), colorPalette.usableControlArea.outline);
      this.outlineShape(createControlArea(Vector.right), colorPalette.usableControlArea.outline);
    }
  }

  public renderEntityTransformControls(simulationInspector: SimulationInspector) {
    switch (simulationInspector.transformMode) {
      case TransformMode.Position:
        this.renderEntityTransformPositionControl(simulationInspector);
        break;

      case TransformMode.Rotation:
        this.renderEntityTransformRotationControls(simulationInspector);
        break;

      case TransformMode.Scale:
        this.renderEntityTransformScaleControls(simulationInspector);
        break;
    }
  }

  public renderFixedShape(shape: Shape, color: Color) {
    const { context } = this;
    const renderingPosition = this.getRenderingPosition(shape.arithmeticMean());
    
    context.save();
    context.translate(...renderingPosition.raw);
    this.defineFixedShapePath(shape);
    context.fillStyle = color.toString()
    context.fill();
    context.restore();
  }

  public renderEntityMeshBoundaryRectangle(meshRenderer: MeshRenderer) {
    const { context } = this;

    const renderingPosition = this.getRenderingPosition(meshRenderer.transform.position);
    const opticRotation = this.optic.rotation;
    const transformedShape = meshRenderer.shape.withTransform(Transform.setRotation(meshRenderer.transform.rotation - opticRotation).setScale(meshRenderer.transform.scale.divide(this.optic.scale)));
    const shape = transformedShape.bounds;
    
    context.save();
    context.translate(renderingPosition.x, renderingPosition.y);
    this.defineShapePath(shape);
    context.stroke();
    context.restore();
  }

  public highlightMesh(meshRenderer: MeshRenderer, color = Color.blue) {
    const { context } = this;
    const renderingPosition = this.getRenderingPosition(meshRenderer.transform.position);
    const opticRotation = this.optic.rotation;
    const transformedShape = meshRenderer.shape.withTransform(Transform.setRotation(meshRenderer.transform.rotation - opticRotation).setScale(meshRenderer.transform.scale));

    context.save();
    context.translate(...renderingPosition.raw);
    this.defineShapePath(transformedShape);
    context.strokeStyle = color.toString();
    context.lineWidth = 2;
    context.stroke();
    context.restore();
  }

  public renderFixedCircle(center: Vector, radius: number, color: Color, width = 2) {
    const { context } = this;
    
    context.save();
    const renderingPosition = this.getRenderingPosition(center)
    context.translate(...renderingPosition.raw);
    this.defineFixedCirclePath(radius);
    context.lineWidth = width;
    context.strokeStyle = color.toString();
    context.stroke();
    context.restore();
  }

  public defineFixedCirclePath(radius: number) {
    const { context } = this;

    context.beginPath();
    context.arc(0, 0, radius * this.optic.pixelsPerUnit, 0, Math.PI * 2);
    context.closePath();
  }

  public renderFixedDirectionalLine(pivot: Vector, direction: Vector, color: Color, width = 2) {
    const scaledDirection = direction.multiply(this.optic.scale);
    this.renderDirectionalLine(pivot, scaledDirection, color, width);
  }

  public renderFixedDisk(fulcrum: Vector, radius: number, color: Color) {
    const { context } = this;

    context.save();
    const renderingPosition = this.getRenderingPosition(fulcrum);
    context.translate(...renderingPosition.raw)
    this.defineFixedCirclePath(radius);
    context.fillStyle = color.toString();
    context.fill();
    context.restore();
  }

  public renderText(fulcrum: Vector, text: string, size = 2, color = Color.black) {
    const { context } = this;
    context.save();
    const renderingPosition = this.getRenderingPosition(fulcrum);
    const a = Vector.one.multiply(size).multiply(this.optic.scaledPixelsPerUnit());
    context.translate(...renderingPosition.raw);
    context.fillStyle = color.toString();
    context.font = `${a.y}px Arial`
    context.fillText(text, 0, 0);
    context.restore();
  }

  public renderFixedText(fulcrum: Vector, text: string, size = 2, color = Color.black) {
    const { context } = this;
    context.save();
    const renderingPosition = this.getRenderingPosition(fulcrum)
    const a = Vector.one.multiply(size).multiply(this.optic.pixelsPerUnit);
    context.translate(...renderingPosition.raw);
    context.fillStyle = color.toString();
    context.font = `${a.y}px Arial`
    context.fillText(text, 0, 0);
    context.restore();
  }

  public renderStaticText(fulcrum: Vector, text: string, size = 2, color = Color.black) {
    const { context } = this;
    context.save();
    const renderingPosition = fulcrum.multiply(this.optic.pixelsPerUnit, Vector.reverseY);
    const a = Vector.one.multiply(size).multiply(this.optic.pixelsPerUnit);
    context.translate(...renderingPosition.raw);
    context.fillStyle = color.toString();
    context.font = `${a.y}px Arial`
    context.fillText(text, 0, 0);
    context.restore();
  }

  public renderEntityName(entity: Entity) {
    const { context } = this;
    const entityPureTransform = entity.transform.toPureTransform();
    const entityBounds = new Rectangle().withTransform(entityPureTransform).bounds;
    const renderingPosition = entityBounds.vertices[0].subtract(this.optic.scenePosition).multiply(this.optic.scaledPixelsPerUnit(), Vector.reverseY);
    const margin = this.getRenderingPosition(Vector.up.multiply(0.1))
    context.save();
    context.font = '21px serif';
    context.fillStyle = 'red';
    context.translate(...renderingPosition.raw);
    context.fillText(entity.name, ...margin.raw);
    context.restore();
  }
}