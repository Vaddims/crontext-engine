import { Component } from "../core";
import { Color } from "../core/color";
import { Optic } from "../core/optic";
import { SimulationRenderer } from "../renderers/simulation-renderer";
import { Vector } from "../core/vector";
import { SimulationRenderingPipeline, SimulationRenderingPipelineConstuctor } from "../rendering-pipelines/simulation-rendering-pipeline";
import { MeshRenderer } from "./mesh-renderer";
import { LightSource } from "./light";
import { AreaLight } from "./light-sources/area-light";

export class Camera extends Component {
  public SimulationRenderingPipeline: SimulationRenderingPipelineConstuctor = SimulationRenderingPipeline;

  public canvasRelativePosition = Vector.zero;
  public canvasRelativeSize = Vector.one;

  public background = Color.white;

  render(renderer: SimulationRenderer) {
    const { context, canvasSize, simulation } = renderer;
    const { scene } = simulation;
    const optic = this.toOptic();
    optic.pixelsPerUnit = renderer.pixelsPerUnit;
    const renderingPipelineInstance = new this.SimulationRenderingPipeline(renderer.context, optic);

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

    for (const lightSource of scene.getAllComponentsOfType(LightSource)) {
      if (lightSource instanceof AreaLight) {
        lightSource.render(renderingPipelineInstance);
      }
    }
    
    context.restore();
  }
  
  protected renderScene(renderer: SimulationRenderer, renderingPipelineInstance: SimulationRenderingPipeline) {
    const { scene } = renderer.simulation;

    for (const entity of scene) { // TODO ADD RENDERING LAYERS
      const meshRenderer = entity.components.find(MeshRenderer);
      if (!meshRenderer) {
        continue;
      }

      renderingPipelineInstance.renderEntityMesh(meshRenderer);
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