import { Component, Renderer, Scene, Shape, Transform } from "../core";
import { Color } from "../core/color";
import { Optic } from "../core/optic";
import { SimulationRenderer } from "../renderers/simulation-renderer";
import { Vector } from "../core/vector";
import { SimulationRenderingPipeline, SimulationRenderingPipelineConstuctor } from "../rendering-pipelines/simulation-rendering-pipeline";
import { MeshRenderer } from "./mesh-renderer";
import { LightSource } from "./light";
import { PointLight } from "./light-sources/point-light";
import { Layer } from "../core/layer";
import { Gizmos } from "../core/gizmos";
import { Rectangle } from "../shapes";

export class Camera extends Component {
  public SimulationRenderingPipeline: SimulationRenderingPipelineConstuctor = SimulationRenderingPipeline;

  public readonly layerMask: Layer[] = [Layer.camera];
  public canvasRelativePosition = Vector.zero;
  public canvasRelativeSize = Vector.one;

  public background = Color.white;

  render(renderer: SimulationRenderer) {
    const { context, canvasSize } = renderer;
    const optic = this.toOptic();
    optic.pixelsPerUnit = renderer.pixelsPerUnit;
    const renderingPipelineInstance = new this.SimulationRenderingPipeline(renderer, optic);

    const cameraPixelPosition = this.canvasRelativePosition.multiply(canvasSize);
    const cameraPixelSize = this.canvasRelativeSize.multiply(canvasSize);
    
    context.save();
    
    context.beginPath(); 
    context.rect(...cameraPixelPosition.raw, ...cameraPixelSize.raw);
    context.closePath();
    context.clip();

    context.fillStyle = this.background.toString();
    context.fill();

    context.translate(...cameraPixelPosition.add(cameraPixelSize.divide(2)).raw);

    this.renderScene(renderer, renderingPipelineInstance);
    this.renderSceneLight(renderer, renderingPipelineInstance);

    
    context.restore();
  }

  public gizmosRender(gizmos: Gizmos) {
    const bounds = this.getBounds(gizmos.renderer);
    gizmos.highlightVertices(bounds.vertices, Color.blue);

    for (const entity of gizmos.renderer.simulation.scene) {
      const vertices = entity.components.find(MeshRenderer)?.relativeVerticesPosition();
      if (!vertices) {
        continue;
      }

      const positionedShape = new Shape(vertices);
      if (positionedShape.overlaps(bounds)) {
        gizmos.highlightVertices(positionedShape.vertices, Color.red);
      }
    }
  }
  
  protected renderScene(renderer: SimulationRenderer, renderingPipelineInstance: SimulationRenderingPipeline) {
    const { scene } = renderer.simulation;

    for (const entity of scene) {
      if (this.layerMask.some(layerMask => entity.layers.has(layerMask))) {
        continue;
      }

      const meshRenderer = entity.components.find(MeshRenderer);
      if (!meshRenderer) {
        continue;
      }

      renderingPipelineInstance.renderEntityMesh(meshRenderer);
    }
  }

  public getBounds(renderer: Renderer) {
    const { unitFit, pixelRatio } = renderer;
    const boundaryScale = Vector.one.multiply(unitFit, pixelRatio, this.transform.scale);
    const boundary = new Rectangle().withTransform(this.transform.toPureTransform().setScale(boundaryScale));
    return boundary;
  }

  protected renderSceneLight(renderer: SimulationRenderer, renderingPipelineInstance: SimulationRenderingPipeline) {
    const { scene } = renderer.simulation;

    for (const lightSource of scene.getAllComponentsOfType(LightSource)) {
      lightSource.render(renderingPipelineInstance);
    }
  }

  public getPixelsPerUnit(renderer: SimulationRenderer) {
    const cameraPixelSize = renderer.canvasSize.multiply(this.canvasRelativeSize);
    const axisDepecndence = renderer.scaleDependenceAxis === 'width' ? 'x' : 'y';
    return cameraPixelSize[axisDepecndence] / renderer.unitFit;
  }

  toOptic() {
    const { position, scale, rotation } = this.transform;

    const optic = new Optic();
    optic.scenePosition = position;
    optic.scale = scale;
    optic.rotation = rotation;
    optic.background = this.background;
    return optic;
  }
}