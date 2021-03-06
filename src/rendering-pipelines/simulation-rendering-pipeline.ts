import { MeshRenderer } from "../components/mesh-renderer";
import { SimulationRenderer } from "../renderers/simulation-renderer";
import { RenderingPipeline } from "../core/rendering-pipeline";
import { Shape } from "../core/shape";
import { Vector } from "../core/vector";
import { Optic } from "../core/optic";
import { rotatedOffsetPosition } from "../utils/crontext-math";
import { Color } from "../core";

interface RadialGradientColorStop {
  offset: number;
  color: Color;
}

export class SimulationRenderingPipeline extends RenderingPipeline {
  public readonly context: CanvasRenderingContext2D;
  public readonly optic: Optic;

  constructor(context: CanvasRenderingContext2D, optic: Optic) {
    super(context);
    this.context = context;
    this.optic = optic;
  }

  protected getRenderingPosition(position: Vector) {
    return position.subtract(this.optic.scenePosition).multiply(this.optic.scaledPixelsPerUnit(), Vector.reverseY);
  }

  public renderEntityMesh(meshRenderer: MeshRenderer) {
    const { context } = this;
    const { entity, shape, color } = meshRenderer;
    const { position, rotation, scale } = entity.transform;

    const opticRotation = this.optic.rotation;
    const transformedShape = shape.withTransform(rotation - opticRotation, scale);

    const renderingPosition = this.getRenderingPosition(position);
    const translate = rotatedOffsetPosition(renderingPosition, opticRotation);

    context.save();
    context.translate(...translate.raw);
    this.defineShapePath(transformedShape);
    context.fillStyle = context.strokeStyle = color.toString();
    if (transformedShape.vertices.length >= 3) {
      context.fill();
    } else {
      context.stroke();
    }
    
    context.restore();
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

  public renderLine(pivot: Vector, end: Vector, color: Color) {
    const { context } = this;

    const pivotRenderingPosition = this.getRenderingPosition(pivot);
    const endRenderingPosition = this.getRenderingPosition(end);

    context.save();
    context.beginPath();
    context.moveTo(...pivotRenderingPosition.raw);
    context.lineTo(...endRenderingPosition.raw);
    context.closePath();
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = color.toString();
    context.lineJoin = context.lineCap = 'round';
    context.stroke();
    context.restore();
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

  public createMask(vertices: Vector[]) {
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
}

export interface SimulationRenderingPipelineConstuctor {
  new (context: CanvasRenderingContext2D, optic: Optic): SimulationRenderingPipeline;
}