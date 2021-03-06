import { MeshRenderer } from "../components/mesh-renderer";
import { RenderingPipeline } from "../core";
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

export class SimulationInspectorRenderingPipeline extends SimulationRenderingPipeline {
  renderCameraViewport(camera: Camera, canvasSize: Vector) {
    const { position } = camera.transform;
    const cameraOptic = camera.toOptic();
    cameraOptic.pixelsPerUnit = this.optic.pixelsPerUnit;
    
    const renderingPosition = this.getRenderingPosition(position);
    const pixelRatio = canvasSize.divide(canvasSize.y) // TODO REWORK FOR AXIS DEPENDECE
    const unitFit = 10; // TODO DYNAMIC GET unitFit
    const boundaryScale = Vector.one.multiply(unitFit, pixelRatio, cameraOptic.scale);
    const boundary = new Rectangle().withTransform(cameraOptic.rotation, boundaryScale);
    this.context.save();
    this.context.translate(...renderingPosition.raw);
    this.defineShapePath(boundary);
    this.context.strokeStyle = Color.blue.toString();
    this.context.stroke();
    this.context.restore();
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
    const { vertices } = shape;
    for (let i = 0; i < vertices.length; i++) {
      const vertex = vertices[i].multiply(this.optic.pixelsPerUnit);
      if (i === 0) {
        context.moveTo(vertex.x, -vertex.y);
        continue;
      }
      context.lineTo(vertex.x, -vertex.y);
    }
    context.closePath();
  }

  public renderEntityTransform(entity: Entity, space = Space.local) {
    const renderTransformAxis = (rotation: number, color: Color) => {
      const { context } = this;
      const renderingPosition = this.getRenderingPosition(entity.transform.position)
      const point = renderingPosition.add(rotatedOffsetPosition(Vector.up.multiply(1.5), rotation).multiply(this.optic.pixelsPerUnit, Vector.reverseY));

      context.save();

      context.save();
      context.beginPath();
      context.moveTo(...renderingPosition.raw);
      context.lineTo(...point.raw);
      context.closePath();
      context.restore();

      context.lineWidth = 2;
      context.strokeStyle = context.fillStyle = color.toString();
      context.stroke();

      context.translate(point.x, point.y);
      this.defineFixedShapePath(new Triangle().withTransform(rotation, new Vector(0.25, 0.5)));
      context.fill();
      context.restore();
    }

    if (space === Space.global) {
      renderTransformAxis(0, Color.green);
      renderTransformAxis(-Math.PI / 2, Color.red);
      return;
    }

    renderTransformAxis(entity.transform.rotation, Color.green);
    renderTransformAxis(entity.transform.rotation - Math.PI / 2, Color.red);
  }

  public renderEntityMeshBoundaryRectangle(meshRenderer: MeshRenderer) {
    const { context } = this;

    const renderingPosition = this.getRenderingPosition(meshRenderer.transform.position);
    const opticRotation = this.optic.rotation;
    const transformedShape = meshRenderer.shape.withTransform(meshRenderer.transform.rotation - opticRotation, meshRenderer.transform.scale.divide(this.optic.scale));
    const shape = transformedShape.getBoundaryRectangle();
    
    context.save();
    context.translate(renderingPosition.x, renderingPosition.y);
    this.defineShapePath(shape);
    context.stroke();
    context.restore();
  }

  public highlightMesh(meshRenderer: MeshRenderer) {
    const { context } = this;
    const renderingPosition = this.getRenderingPosition(meshRenderer.transform.position);
    const opticRotation = this.optic.rotation;
    const transformedShape = meshRenderer.shape
      .withRotation(meshRenderer.transform.rotation - opticRotation);

    context.save();
    context.translate(...renderingPosition.raw);
    this.defineShapePath(transformedShape);
    context.strokeStyle = new Color(255, 255, 0).toString();
    context.lineWidth = 2;
    context.stroke();
    context.restore();
  }

  public renderFixedCircle(center: Vector, radius: number, color: Color) {
    const { context } = this;
    
    context.save();
    const renderingPosition = this.getRenderingPosition(center)
    context.translate(...renderingPosition.raw);
    this.defineFixedCirclePath(radius);
    context.lineWidth = 2;
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

  public renderEntityName(entity: Entity) {
    const { context } = this;
    const { scale, rotation, position } = entity.transform;
    const boundaries = new Rectangle().withTransform(rotation, scale).withOffset(position).getBoundaryRectangle();
    const renderingPosition = boundaries.vertices[0].subtract(this.optic.scenePosition).multiply(this.optic.scaledPixelsPerUnit(), Vector.reverseY);
    const margin = this.getRenderingPosition(Vector.up.multiply(0.1))
    context.save();
    context.font = '21px serif';
    context.fillStyle = 'red';
    context.translate(...renderingPosition.raw);
    context.fillText(entity.name, ...margin.raw);
    context.restore();
    
    console.log('re')
  }
}