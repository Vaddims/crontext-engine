import { MeshRenderer } from "../components/mesh-renderer";
import { SimulationInspectorRenderingPipeline } from "../rendering-pipelines/simulation-inspector-rendering-pipeline";
import { Color } from "../core/color";
import { Renderer } from "../core/renderer";
import { Simulation } from "../simulations/simulation";
import { SimulationInspector } from "../simulations/simulation-inspector";
import { Vector } from "../core/vector";
import { Camera } from "../components/camera";
import { Gizmos } from "../core/gizmos";
import { Component, Entity, Shape, Transform } from "../core";
import { Rectangle } from "../shapes";
import { BoundingBox } from "../shapes/bounding-box";

export class SimulationInspectorRenderer extends Renderer {
  public readonly inspector: SimulationInspector;
  public lastKnownMousePosition = Vector.zero;

  public fps = 0;
  public potentialFps = 0;
  public lastPerformanceMesaure = performance.now();

  constructor(canvas: HTMLCanvasElement, simulation: Simulation) {
    super(canvas);
    this.inspector = new SimulationInspector(this, simulation);
    this.render();

    if (Object.prototype.hasOwnProperty.call(window, 'safari')) {
      canvas.addEventListener('gesturestart', this.gestureStartHandler.bind(this))
      canvas.addEventListener('gesturechange', this.gestureHandler.bind(this))
      canvas.addEventListener('gestureend', this.gestureHandler.bind(this))
      canvas.addEventListener('wheel', this.wheelHandler.bind(this));
    }

    // TODO OTHER BROWSER

    canvas.addEventListener('mousemove', this.mouseHandler.bind(this));
    canvas.addEventListener('click', this.onClick.bind(this));
  }

  protected mouseHandler(event: MouseEvent) {
    this.lastKnownMousePosition = new Vector(event.offsetX, event.offsetY);
  }

  protected gestureStartHandler(event: any) {
    event.preventDefault();
    this.inspector.previousScale = 0;
  }

  protected gestureHandler(event: any) {
    event.preventDefault();
    const scale = Math.log10(event.scale);
    this.inspector.handleOpticScale(scale, this.canvasSize, this.lastKnownMousePosition);
    this.inspector.previousScale = scale;
  }

  protected wheelHandler(event: WheelEvent) {
    event.preventDefault();
    this.inspector.handleOpticMovement(event);
  }

  protected onClick(event: MouseEvent) {
    this.inspector.handleClick(event, this.canvasSize.divide(2));
  }

  public getBounds(renderer: Renderer) {
    const { unitFit, pixelRatio } = renderer;
    const boundaryScale = Vector.one.multiply(unitFit, pixelRatio, this.inspector.optic.scale);
    const boundary = new Rectangle().withTransform(new Transform(this.inspector.optic.scenePosition, this.inspector.optic.scale, this.inspector.optic.rotation).setScale(boundaryScale));
    return boundary;
  }
  
  public render(): void {
    const renderStartStamp = performance.now();

    const { context, canvasSize } = this;
    const { scene, renderer } = this.inspector.simulation;

    context.save();
    context.clearRect(0, 0, ...canvasSize.raw);

    context.beginPath();
    context.rect(0, 0, ...canvasSize.raw);
    context.closePath();
    context.clip();

    const optic = this.inspector.optic;
    optic.pixelsPerUnit = this.pixelsPerUnit;
    const renderingPipeline = new SimulationInspectorRenderingPipeline(this, optic);
    const gizmos = new Gizmos(this, renderingPipeline);
    
    context.beginPath();
    context.rect(0, 0, ...canvasSize.raw);
    context.closePath();
    context.clip();

    context.fillStyle = Color.white.toString();
    context.fill();

    context.translate(...canvasSize.divide(2).raw);

    renderingPipeline.renderMeshMarkup(this.canvasSize);
    
    const bounds = this.getBounds(renderer);
    const boundingBoxViewportTraceEntities = scene.spatialPartition.getBoundingBoxHeightTraceElements(bounds);

    const viewportEntities = new Set<Entity>();
    for (const entity of boundingBoxViewportTraceEntities) {
      const meshRenderer = entity.components.find(MeshRenderer);
      if (!meshRenderer) {
        continue;
      }

      if (!BoundingBox.boundsOverlap(bounds, new Shape(meshRenderer.relativeVerticesPosition()).bounds)) {
        continue;
      }

      viewportEntities.add(entity);
    }

    for (const entity of viewportEntities) {
      const meshRenderer = entity.components.find(MeshRenderer);
      if (!meshRenderer) {
        continue;
      }
      
      renderingPipeline.renderEntityMesh(meshRenderer);
    }

    const cameras = scene.getCameras();
    for (const camera of cameras) {
      for (const entity of camera['boundingBoxViewportTraceEntities']) {
        const meshRenderer = entity.components.find(MeshRenderer);
        if (!meshRenderer) {
          continue;
        }
      }

      for (const entity of camera['viewportEntities']) {
        const meshRenderer = entity.components.find(MeshRenderer);
        if (!meshRenderer) {
          continue;
        }
      }
    }

    for (const entity of scene.getEntities()) {
      for (const component of entity.components) {
        component[Component.onGizmosRender]?.(gizmos);
      }
    }

    const { inspectEntities } = this.inspector;

    for (const entity of inspectEntities) {
      const meshRenderer = entity.components.find(MeshRenderer);

      if (entity.components.find(Camera)) {
        continue;
      }

      if (meshRenderer) {
        renderingPipeline.highlightMesh(meshRenderer);
      }

      renderingPipeline.renderEntityTransform(entity);
    }

    context.restore();

    requestAnimationFrame(this.render.bind(this));

    const renderEndStamp = performance.now();

    const fpsDelta = (renderEndStamp - this.lastPerformanceMesaure) / 1000;
    this.fps = 1 / fpsDelta;

    const potentialFpsDelta = (renderEndStamp - renderStartStamp) / 1000;
    this.potentialFps = 1 / potentialFpsDelta;

    this.lastPerformanceMesaure = renderEndStamp;
  }

  public get simulation() {
    return this.inspector.simulation;
  }
}