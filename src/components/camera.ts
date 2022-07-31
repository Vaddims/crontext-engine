import { Component } from "../core";
import { Color } from "../core/color";
import { Optic } from "../core/optic";
import { SimulationRenderer } from "../renderers/simulation-renderer";
import { Vector } from "../core/vector";
import { SimulationRenderingPipeline, SimulationRenderingPipelineConstuctor } from "../rendering-pipelines/simulation-rendering-pipeline";
import { MeshRenderer } from "./mesh-renderer";
import { LightSource } from "./light";
import { PointLight } from "./light-sources/point-light";
import { Layer } from "../core/layer";

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

  protected renderSceneLight(renderer: SimulationRenderer, renderingPipelineInstance: SimulationRenderingPipeline) {
    const { scene } = renderer.simulation;

    for (const lightSource of scene.getAllComponentsOfType(LightSource)) {
      if (lightSource instanceof PointLight) {
        lightSource.render(renderingPipelineInstance);
      }
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