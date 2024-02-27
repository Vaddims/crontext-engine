import { MeshRenderer } from "../components/mesh-renderer";
import { SimulationInspectorRenderingPipeline } from "../rendering-pipelines/simulation-inspector-rendering-pipeline";
import { Color } from "../core/color";
import { Renderer } from "../core/renderer";
import { Simulation } from "../simulations/simulation";
import { SimulationInspector, TransformMode } from "../simulations/simulation-inspector";
import { Vector } from "../core/vector";
import { Camera } from "../components/camera";
import { Gizmos } from "../core/gizmos";
import { Component, Engine, Entity, Ray, Shape, Space, Transform } from "../core";
import { Circle, Rectangle } from "../shapes";
import { BoundingBox } from "../shapes/bounding-box";
import { rotatedOffsetPosition } from "../utils";
import { SpatialPartition } from "../core/spatial-partition/spatial-partition";
import { MediaRenderer } from "../components";

export class SimulationInspectorRenderer extends Renderer {
  public readonly inspector: SimulationInspector;
  public renderFrame = true;
  public lastKnownMousePosition = Vector.zero;
  public mouseDown = false;
  public mouseMovedWhileClicked = false;

  public clickedTransformControls = false;
  public transformFace = Vector.one;

  constructor(simulation: Simulation) {
    super();
    const { canvas } = this;

    this.inspector = new SimulationInspector(this, simulation);
    Engine['registeredRenderers'].add(this);

    if (Object.prototype.hasOwnProperty.call(window, 'safari')) {
      canvas.addEventListener('gesturestart', this.gestureStartHandler.bind(this))
      canvas.addEventListener('gesturechange', this.gestureHandler.bind(this))
      canvas.addEventListener('gestureend', this.gestureHandler.bind(this))
      canvas.addEventListener('wheel', this.safariWheelHandler.bind(this));
    } else {
      canvas.addEventListener('wheel', this.wheelHandler.bind(this));
      canvas.addEventListener('mousemove', this.mouseHandler.bind(this));
    }

    canvas.addEventListener('mousemove', this.mousePositionHandler.bind(this));
    canvas.addEventListener('mousedown', this.mouseDownHandler.bind(this));
    canvas.addEventListener('mouseup', this.mouseUpHandler.bind(this));
    canvas.addEventListener('keydown', this.keypressHandler.bind(this));
  }

  public keypressHandler(event: KeyboardEvent) {
    switch (event.key.toUpperCase()) {
      case 'BACKSPACE':
        if (event.metaKey) {
          this.deleteAction();
        }
        break;
    };
  }

  public deleteAction() {
    this.inspector.selectedEntities.forEach((entity) => {
      entity.destroy().resolve();
    });


    this.inspector.selectEntities([]);
  }

  protected mousePositionHandler(event: MouseEvent) {
    this.lastKnownMousePosition = new Vector(event.offsetX, event.offsetY);
  }

  protected mouseHandler(event: MouseEvent) {
    this.mouseMovedWhileClicked = true;

    const currentMousePosition = new Vector(event.offsetX, event.offsetY);
    const lastMouseScenePosition = this.canvasPointToCoordinates(this.inspector.optic, this.lastKnownMousePosition);
    const currentMouseScenePosition = this.canvasPointToCoordinates(this.inspector.optic, currentMousePosition);

    if (this.mouseDown) {
      if (this.inspector.usingControls) {
        this.inspector.applyDeltaControls(lastMouseScenePosition, currentMouseScenePosition);
      } else {
        const offset = this.lastKnownMousePosition.subtract(new Vector(event.offsetX, event.offsetY)).divide(window.devicePixelRatio);
        this.inspector.handleOpticMovement(offset)
      }
    }
  }

  protected mouseDownHandler(event: MouseEvent) {
    this.mouseMovedWhileClicked = false;
    this.mouseDown = true;

    const mouseScenePosition = this.canvasPointToCoordinates(this.inspector.optic, new Vector(event.offsetX, event.offsetY));
    this.inspector.defineDeltaControls(mouseScenePosition);
  }

  protected mouseUpHandler(event: MouseEvent) {
    this.mouseDown = false;

    if (this.clickedTransformControls) {

    } else if (!this.mouseMovedWhileClicked) {
      const screenCoords = new Vector(event.offsetX, event.offsetY);
      const coordinates = this.canvasPointToCoordinates(this.inspector.optic, screenCoords);
      this.inspector.handleSceneClick(coordinates, event.metaKey)
    }

    this.inspector.usingControls = false;


    this.mouseMovedWhileClicked = false;
    this.clickedTransformControls = false;
  }

  protected gestureStartHandler(event: any) {
    event.preventDefault();
    this.inspector.previousScale = 0;
  }

  protected gestureHandler(event: any) {
    event.preventDefault();
    const scale = Math.log10(event.scale);
    const deltaScale = scale - this.inspector.previousScale;
    this.inspector.handleOpticScale(deltaScale, this.canvasSize, this.lastKnownMousePosition);
    this.inspector.previousScale = scale;
  }

  protected safariWheelHandler(event: WheelEvent) {
    event.preventDefault();
    const offset = new Vector(event.deltaX, event.deltaY).divide(window.devicePixelRatio);
    this.inspector.handleOpticMovement(offset);
  }

  protected wheelHandler(event: WheelEvent) {
    event.preventDefault();
    if (event.deltaY === 0) {
      return;
    }

    const direction = event.deltaY / Math.abs(event.deltaY);
    const deltaScale = -(Math.log10(Math.abs(event.deltaY)) * direction) / 100;
    this.inspector.handleOpticScale(deltaScale, this.canvasSize, this.lastKnownMousePosition)
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

  public updateTick(): void {
    this.render();
  }
  
  public render(): void {
    if (!this.renderFrame) {
      return
    }

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
    const spatialPartition = <SpatialPartition<MeshRenderer>>this.simulation.scene.cache[MeshRenderer.CacheKey.MRSP];
    const boundingBoxViewportTraceMeshRenderers = spatialPartition.getBoundingBoxHeightTraceElements(bounds);

    const viewportMeshRenderers = new Set<MeshRenderer>();
    for (const meshRenderer of boundingBoxViewportTraceMeshRenderers) {
      if (!BoundingBox.boundsOverlap(bounds, new Shape(meshRenderer.relativeVerticesPosition()).bounds)) {
        continue;
      }

      viewportMeshRenderers.add(meshRenderer);
    }

    // Todo render by z index
    for (const entity of renderer.simulation.scene.getComponentsOfType(MediaRenderer)) {
      renderingPipeline.renderEntityMedia(entity);
    }

    for (const viewportMeshRenderer of viewportMeshRenderers) {
      renderingPipeline.renderEntityMesh(viewportMeshRenderer);
    }

    for (const component of scene.getComponents()) {
      component[Component.onGizmosRender]?.(gizmos);
    }

    const { selectedEntities } = this.inspector;

    for (const entity of selectedEntities) {
      const meshRenderer = entity.components.find(MeshRenderer);

      if (entity.components.find(Camera)) {
        continue;
      }

      if (meshRenderer) {
        renderingPipeline.highlightMesh(meshRenderer);
      }
    }

    if (selectedEntities.size > 0) {
      renderingPipeline.renderEntityTransformControls(this.inspector);
    }

    context.restore();
  }

  public get simulation() {
    return this.inspector.simulation;
  }
}