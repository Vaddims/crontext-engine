import { Component, Entity, Renderer, Shape } from "../core";
import { Color } from "../core/color";
import { Optic } from "../core/optic";
import { SimulationRenderer } from "../renderers/simulation-renderer";
import { Vector } from "../core/vector";
import { SimulationRenderingPipeline, SimulationRenderingPipelineConstuctor } from "../rendering-pipelines/simulation-rendering-pipeline";
import { MeshRenderer } from "./mesh-renderer";
import { LightSource } from "./light";
import { Layer } from "../core/layer";
import { Gizmos } from "../core/gizmos";
import { Rectangle } from "../shapes";
import { SpatialPartitionCluster } from "../core/spatial-partition/spatial-partition-cluster";
import { BoundingBox } from "../shapes/bounding-box";
import { getBaseLog } from "../utils";

// TODO NOT TO RENDER UNEEDED ENTITIES LIKE IN GIZMOS EXAMPLE
export class Camera extends Component {
  public SimulationRenderingPipeline: SimulationRenderingPipelineConstuctor = SimulationRenderingPipeline;

  public readonly layerMask: Layer[] = [Layer.camera];
  public canvasRelativePosition = Vector.zero;
  public canvasRelativeSize = Vector.one;

  public background = Color.white;

  protected viewportEntities = new Set<Entity>();
  protected boundingBoxViewportTraceEntities = new Set<Entity>();

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

  public [Component.onGizmosRender](gizmos: Gizmos) {
    const bounds = this.getBounds(gizmos.renderer);
    gizmos.highlightVertices(bounds.vertices, Color.blue);
  }

  protected viewportCullingMask(renderer: Renderer) {
    const { scene } = this.entity;
    if (!scene) {
      throw new Error();
    }

    const viewportBoundingBox = this.getBounds(renderer);
    const boundingBoxViewportTraceEntities = scene.spatialPartition.getBoundingBoxHeightTraceElements(viewportBoundingBox);

    const viewportEntities = new Set<Entity>();
    for (const entity of boundingBoxViewportTraceEntities) {
      const meshRenderer = entity.components.find(MeshRenderer);
      if (!meshRenderer) {
        continue;
      }

      if (!BoundingBox.boundsOverlap(viewportBoundingBox, new Shape(meshRenderer.relativeVerticesPosition()).bounds)) {
        continue;
      }

      viewportEntities.add(entity);
    }

    return {
      boundingBoxViewportTraceEntities,
      viewportEntities,
    }
  }
  
  protected renderScene(renderer: SimulationRenderer, renderingPipelineInstance: SimulationRenderingPipeline) {
    this.boundingBoxViewportTraceEntities.clear();
    this.viewportEntities.clear();

    const {
      boundingBoxViewportTraceEntities,
      viewportEntities,
    } = this.viewportCullingMask(renderer);
    
    this.boundingBoxViewportTraceEntities = boundingBoxViewportTraceEntities;
    this.viewportEntities = viewportEntities;

    // console.log(this.viewportEntities.size)
    for (const entity of this.viewportEntities) {
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

    for (const lightSource of scene.getComponentsOfType(LightSource)) {
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