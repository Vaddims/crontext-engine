import { MeshRenderer } from "../components/mesh-renderer";
import { SimulationRenderer } from "../renderers/simulation-renderer";
import { RenderingPipeline } from "../core/rendering-pipeline";
import { Shape } from "../core/shape";
import { Vector } from "../core/vector";
import { Optic } from "../core/optic";
import { rotatedOffsetPosition } from "../utils/crontext-math";
import { Color, Renderer, Transform } from "../core";
import { Rectangle } from "../shapes";
import { MediaRenderer } from "../components";

interface RadialGradientColorStop {
  offset: number;
  color: Color;
}

export class SimulationRenderingPipeline<T extends Renderer = SimulationRenderer> extends RenderingPipeline<T> {
  public readonly context: CanvasRenderingContext2D;
  public readonly optic: Optic;

  constructor(renderer: T, optic: Optic) {
    super(renderer);
    this.context = renderer.context;
    if (!this.context) console.log('No context in simulation rendering pipeline')
    this.optic = optic;
  }

  protected getRenderingPosition(position: Vector, rotation: number = 0) {
    return rotatedOffsetPosition(position.subtract(this.optic.scenePosition), rotation -this.optic.rotation).multiply(this.optic.scaledPixelsPerUnit(), Vector.reverseY);
  }

  public defineShapePath(shape: Shape) {
    const { context } = this;

    context.beginPath();
    const { vertices } = shape;
    for (let i = 0; i < vertices.length; i++) {
      const vertex = vertices[i].multiply(this.optic.scaledPixelsPerUnit());
      if (i === 0) {
        context.moveTo(vertex.x, -vertex.y);
        continue;
      }
      context.lineTo(vertex.x, -vertex.y);
    }
    context.closePath();
  }

  public renderShape(shape: Shape, position: Vector, opticRotation: number, color: Color) {
    const { context } = this;

    const renderingPosition = this.getRenderingPosition(position);

    context.save();
    context.translate(...renderingPosition.raw);
    this.defineShapePath(shape);
    context.fillStyle = context.strokeStyle = color.toString();
    if (shape.vertices.length >= 3) {
      context.fill();
    } else {
      context.stroke();
    }
    
    context.restore();
  }

  public renderEntityMesh(meshRenderer: MeshRenderer) {
    const { color } = meshRenderer;
    const transformedShape = meshRenderer.getEntityTransformedShape()
    this.context.save();
    this.renderShape(transformedShape, Vector.zero, 0, new Color(color.red, color.green, color.blue, color.alpha * meshRenderer.opacity));
    this.outlineShape(transformedShape, new Color(meshRenderer.outlineColor.red, meshRenderer.outlineColor.green, meshRenderer.outlineColor.blue, meshRenderer.outlineColor.alpha * meshRenderer.outlineOpacity));
    this.context.restore();
  }

  public renderLine(pivot: Vector, end: Vector, color: Color, width = 2) {
    const { context } = this;

    const pivotRenderingPosition = this.getRenderingPosition(pivot);
    const endRenderingPosition = this.getRenderingPosition(end);

    context.save();
    context.beginPath();
    context.moveTo(...pivotRenderingPosition.raw);
    context.lineTo(...endRenderingPosition.raw);
    context.closePath();
    context.lineWidth = width;
    context.lineCap = 'round';
    context.lineWidth = width;
    context.strokeStyle = color.toString();
    context.lineJoin = context.lineCap = 'round';
    context.stroke();
    context.restore();
  }

  public renderEntityMedia(mediaRenderer: MediaRenderer) {
    const { position, rotation, scale } = mediaRenderer.entity.transform;

    const opticRotation = this.optic.rotation;
    const renderingPosition = this.getRenderingPosition(position);
    const renderingScale = scale.multiply(this.optic.scaledPixelsPerUnit());



    this.context.save();
    this.context.translate(...renderingPosition.raw);
    this.context.rotate(opticRotation - rotation);

    const imageSize = new Vector(mediaRenderer.image.width, mediaRenderer.image.height);
    const sceneRelativeSize = mediaRenderer.referenceSize === 'unit' ? imageSize.divide(Math.max(...imageSize.raw)) : imageSize;
    const renderSize = sceneRelativeSize.multiply(renderingScale);

    this.context.drawImage(mediaRenderer.image, -renderSize.x / 2, -renderSize.y / 2, renderSize.x, renderSize.y);


    // this.context.drawImage(mediaRenderer.image, -width * renderingScale.x / 2, -height * renderingScale.y / 2, width * renderingScale.x, height * renderingScale.y);
    this.context.restore();
  }

  public renderDirectionalLine(pivot: Vector, direction: Vector, color: Color, width = 2) {
    this.renderLine(pivot, pivot.add(direction), color, width);
  }

  public defineCirclePath(radius: number) {
    const { context } = this;

    context.beginPath();
    context.arc(0, 0, radius * this.optic.scaledPixelsPerUnit().x, 0, Math.PI * 2);
    context.closePath();
  }
  
  public renderCircle(center: Vector, radius: number, color: Color) {
    const { context } = this;
    
    context.save();
    const renderingPosition = this.getRenderingPosition(center)
    context.translate(...renderingPosition.raw);
    this.defineCirclePath(radius);
    context.lineWidth = 2;
    context.strokeStyle = color.toString();
    context.stroke();
    context.restore();
  }

  public renderDisk(fulcrum: Vector, radius: number, color: Color) {
    const { context } = this;

    context.save();
    const renderingPosition = this.getRenderingPosition(fulcrum);
    context.translate(...renderingPosition.raw)
    this.defineCirclePath(radius);
    context.fillStyle = color.toString();
    context.fill();
    context.restore();
  }

  public createBlur(intence: number) {
    const { context } = this;

    context.save();
    context.filter = `blur(${intence}px)`;

    return {
      remove: () => context.restore(),
    }
  }

  public createMask(vertices: readonly Vector[] | Vector[]) {
    const { context } = this;

    context.save();
    context.beginPath();
    for (let i = 0; i < vertices.length; i++) {
      const vertex = vertices[i];
      const vertexRenderingPosition = rotatedOffsetPosition(vertex.subtract(this.optic.scenePosition), -this.optic.rotation).multiply(this.optic.scaledPixelsPerUnit(), Vector.reverseY)
      if (i === 0) {
        context.moveTo(...vertexRenderingPosition.raw);
        continue;
      }

      context.lineTo(...vertexRenderingPosition.raw);
    }

    context.closePath();
    context.clip();

    return {
      remove: () => context.restore(),
    }
  }

  public renderRadialGradient(fulcrum: Vector, radius: number, colorStops: RadialGradientColorStop[]) {
    const { context } = this;

    const fulcrumRenderingPosition = rotatedOffsetPosition(fulcrum.subtract(this.optic.scenePosition), -this.optic.rotation).multiply(this.optic.scaledPixelsPerUnit(), Vector.reverseY)
    const radiusRenderingScale = radius * this.optic.pixelsPerUnit / this.optic.scale.y;

    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radiusRenderingScale);
    for (const { offset, color } of colorStops) {
      gradient.addColorStop(offset, color.toString());
    }

    context.save()
    context.translate(...fulcrumRenderingPosition.raw);
    context.fillStyle = gradient;
    context.fillRect(-radiusRenderingScale, -radiusRenderingScale, radiusRenderingScale * 2, radiusRenderingScale * 2) //...toRP(new Vector(r2RenderingScale, -r2RenderingScale)).raw)
    context.restore()
  }

  public renderLinearGradient(fulcrum: Vector, directionalOffset: Vector, width: number, colorStops: RadialGradientColorStop[]) {
    const { context } = this;

    const end = fulcrum.add(directionalOffset);
    const center = fulcrum.add(directionalOffset.divide(2));

    const gradient = context.createLinearGradient(...this.getRenderingPosition(fulcrum).raw, ...this.getRenderingPosition(end).raw);
    for (const { offset, color } of colorStops) {
      gradient.addColorStop(offset, color.toString());
    }

    context.save();
    context.fillStyle = gradient;
    const shape = new Rectangle().withScale(new Vector(directionalOffset.magnitude, width)).withOffset(rotatedOffsetPosition(center.add(this.optic.scenePosition.multiply(Vector.reverse)), -this.optic.rotation)).withRotation(directionalOffset.rotation() - this.optic.rotation)
    this.defineShapePath(shape)
    context.fill();
    context.restore();
  }

  public outlineShape(shape: Shape, color = Color.black) {
    for (let i = 0; i < shape.vertices.length; i++) {
      const vertex = shape.vertices[i];
      const nextVertex = i === shape.vertices.length - 1 ? shape.vertices[0] : shape.vertices[i + 1];
      this.renderLine(vertex, nextVertex, color);
    }
  }

  public outlineFixedShape(shape: Shape, color = Color.black) {
    const { context } = this;

    context.save()
    this.defineShapePath(shape.withScale(this.optic.scale));
    context.strokeStyle = color.toString();
    context.stroke();
    context.restore();
  }
}

export interface SimulationRenderingPipelineConstuctor {
  new (renderer: SimulationRenderer, optic: Optic): SimulationRenderingPipeline;
}