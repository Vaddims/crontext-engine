import { Component, Entity, Renderer, Shape } from "../core";
import { Color } from "../core/color";
import { Optic } from "../core/optic";
import { SimulationRenderer } from "../renderers/simulation-renderer";
import { Vector } from "../core/vector";
import { SimulationRenderingPipeline } from "../rendering-pipelines/simulation-rendering-pipeline";
import { MeshRenderer } from "./mesh-renderer";
import { Light } from "./light";
import { Layer } from "../core/layer";
import { Gizmos } from "../core/gizmos";
import { Rectangle } from "../shapes";
import { SpatialPartitionCluster } from "../core/spatial-partition/spatial-partition-cluster";
import { BoundingBox } from "../shapes/bounding-box";
import { getBaseLog } from "../utils";
import { Transformator } from "objectra";
import BuildinComponent from "../core/buildin-component";

// TODO NOT TO RENDER UNEEDED ENTITIES LIKE IN GIZMOS EXAMPLE
@Transformator.Register()
export class Camera extends BuildinComponent {
  public readonly layerMask: Layer[] = [Layer.camera];
  public canvasRelativePosition = Vector.zero;
  public canvasRelativeSize = Vector.one;

  public background = Color.white;

  @Transformator.Exclude()
  protected viewportMeshRenderers = new Set<MeshRenderer>();

  @Transformator.Exclude()
  protected boundingBoxViewportTraceMeshRenderers = new Set<MeshRenderer>();

  render(renderer: SimulationRenderer) {
    const { context, canvasSize } = renderer;
    const optic = this.toOptic();
    optic.pixelsPerUnit = renderer.pixelsPerUnit;
    const renderingPipelineInstance = new SimulationRenderingPipeline(renderer, optic);

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

    const { scene } = this.entity;
    const spatialPartition = scene.cache[MeshRenderer.CacheKey.MRSP];
    for (const branch of spatialPartition) {
      const bounds = branch.cluster.getSpaceBounds();
      gizmos.highlightVertices(bounds.vertices, new Color(0, 0, 255, 0.1));
    }

    const {
      boundingBoxViewportTraceMeshRenderers,
      viewportMeshRenderers,
    } = this.viewportCullingMask(gizmos.renderer);

    for (const meshRenderer of boundingBoxViewportTraceMeshRenderers) {
      gizmos.highlightVertices(meshRenderer.relativeVerticesPosition(), Color.red);
    }

    for (const viewportMeshRenderer of viewportMeshRenderers) {
      gizmos.highlightVertices(viewportMeshRenderer.relativeVerticesPosition(), Color.green);
    }
  }

  protected viewportCullingMask(renderer: Renderer) {
    const { scene } = this.entity;

    const viewportBoundingBox = this.getBounds(renderer);
    const spatialPartition = scene.cache[MeshRenderer.CacheKey.MRSP];
    const boundingBoxViewportTraceMeshRenderers = spatialPartition.getBoundingBoxHeightTraceElements(viewportBoundingBox);

    const viewportMeshRenderers = new Set<MeshRenderer>();
    for (const meshRenderer of boundingBoxViewportTraceMeshRenderers) {
      if (!BoundingBox.boundsOverlap(viewportBoundingBox, new Shape(meshRenderer.relativeVerticesPosition()).bounds)) {
        continue;
      }

      viewportMeshRenderers.add(meshRenderer);
    }

    return {
      boundingBoxViewportTraceMeshRenderers,
      viewportMeshRenderers,
    }
  }
  
  protected renderScene(renderer: SimulationRenderer, renderingPipelineInstance: SimulationRenderingPipeline) {
    this.boundingBoxViewportTraceMeshRenderers.clear();
    this.viewportMeshRenderers.clear();

    const {
      boundingBoxViewportTraceMeshRenderers,
      viewportMeshRenderers,
    } = this.viewportCullingMask(renderer);
    
    this.boundingBoxViewportTraceMeshRenderers = boundingBoxViewportTraceMeshRenderers;
    this.viewportMeshRenderers = viewportMeshRenderers;

    for (const meshRenderer of this.viewportMeshRenderers) {
      if (this.layerMask.some(layerMask => meshRenderer.entity.layers.has(layerMask))) {
        continue;
      }

      renderingPipelineInstance.renderEntityMesh(meshRenderer);
    }
  }

  public getBounds(renderer: Renderer) {
    const { unitFit, pixelRatio } = renderer;
    const boundaryScale = Vector.one.multiply(unitFit, pixelRatio, this.transform.scale);
    const boundary = new Rectangle().withTransform(this.transform.toPureTransform().setScale(boundaryScale)).bounds;
    return boundary;
  }

  protected renderSceneLight(renderer: SimulationRenderer, renderingPipelineInstance: SimulationRenderingPipeline) {
    const { scene } = renderer.simulation;

    for (const lightSource of scene.getComponentsOfType(Light)) {
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