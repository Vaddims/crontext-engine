import { Color, Entity, Optic, Ray, Renderer, RenderingPipeline, Scene, Shape, Transform, Vector } from "../../core";
import { Gizmos } from "../../core/gizmos";
import { VisibilityPolygon } from "../../core/visibility-polygon";
import { PanoramaVisibilityPolygon } from "../../core/visibility-polygons/panorama-visibility-polygon";
import { SimulationRenderer } from "../../renderers";
import { SimulationRenderingPipeline } from "../../rendering-pipelines";
import { Rectangle } from "../../shapes";
import { lineWithLineIntersection, rotatedOffsetPosition, segmentWithSegmentIntersection } from "../../utils";
import { Camera } from "../camera";
import { LightSource } from "../light";

interface RaycastCheckpoint {
  exposed: Vector,
  endpoint?: Vector,
  endpointSegment?: Shape.Segment,
}

const boundsOverlaping = (a: Shape, b: Shape) => {
  const av = a.vertices;
  const bv = b.vertices;

  return av[1].x > bv[0].x && av[0].x < bv[1].x && av[0].y > bv[3].y && av[3].y < bv[0].y;
}

export class PointLight extends LightSource {
  public range = 20;
  public color = Color.white;
  public ignoreOverlapEntity = false;
  
  private readonly raycastInaccuracy = 0.00001;

  private fps = 0;
  private rerateFPS = true;

  start() {
    setInterval(() => {
      this.rerateFPS = true;
    }, 500);
  }

  render(simulationRenderingPipeline: SimulationRenderingPipeline) {
    const visibilityPolygon = this.getVisibilityPolygon();
    const { path } = visibilityPolygon;

    const { remove: removeMask } = simulationRenderingPipeline.createMask(path);

    simulationRenderingPipeline.renderRadialGradient(this.transform.position, this.range, [{
      offset: 0,
      color: this.color,
    }, {
      offset: 0.5,
      color: Color.transparent,
    }]);

    removeMask();
    simulationRenderingPipeline.renderRadialGradient(this.transform.position, this.range / 5, [{
      offset: 0,
      color: new Color(255, 255, 255, 0.3),
    }, {
      offset: 0.5,
      color: Color.transparent,
    }]);
  }


  gizmosRender(gizmos: Gizmos) {
    const visibilityPolygon = this.getVisibilityPolygon();
    const { path } = visibilityPolygon;
    
    const lineColor = new Color(0, 0, 255, 0.1);
    const vertexColor = Color.blue;
    const vertexHighlightRadius = 0.1;
    
    gizmos.highlightVertices(new Rectangle().withScale(this.range).withOffset(this.transform.position).vertices, new Color(0, 0, 255, 0.1))
    
    if (path) {
      gizmos.highlightVertices(path, Color.blue);
    }

    if (path) {
      for (let i = 0; i < path.length; i++) {
        gizmos.renderLine(this.transform.position, path[i], lineColor);
        gizmos.renderFixedText(path[i], `${i + 1}`, 0.35, Color.red);
      }
    }

    if (this.rerateFPS) {
      this.rerateFPS = false;
      this.fps = Math.min(60, Number(gizmos.renderer.fps.toFixed(0)));
    }
    
    const list = [
      `${this.fps} fps`,
      '',
      `${visibilityPolygon.checkpointVertices.length} total checkpoint vertices`,
      `${visibilityPolygon.obsticlesWithObsticlesInterimVertices.length} entity to entity overlaping vertices`,
      `${visibilityPolygon.obsticlesWithBoundsInterimVertices.length} entity overlap vertices with light bounds`,
      '',
      `${visibilityPolygon.checkpointRaycasts.length} mask checkpoint raycasts`,
      `${path.length} mask path vertices`,
    ]

    for (let i = 0; i < list.length; i++) {
      gizmos.renderStaticText(new Vector(-16, 3 - i / 2), list[i], 0.5);
    }
  }

  public getBounds() {
    const scale = Vector.one.multiply(this.range);
    const boundsTransform = Transform.setScale(scale).setPosition(this.transform.position)
    return new Rectangle().withTransform(boundsTransform);
  }

  private getEntityShapes(entities: Scene | Entity[]) {
    const entityShapes: Shape[] = [];
    for (const entity of entities) {
      const componentInstance = entity.components.find(this.physicalRenderingDependence);
      if (!componentInstance) {
        continue;
      }
      
      const entityShapeVertices = componentInstance.relativeVerticesPosition();
      const entityShape = new Shape(entityShapeVertices);
      entityShapes.push(entityShape);
    }
    
    return entityShapes;
  }

  public overlapsShape(shapes: Shape[], shapeMask: Shape[]) {;
    const escapeRay = Ray.escape(this.transform.position);
    const escapeRayOpenStack = escapeRay.researchOpenStacks(shapes, { shapeMask: shapeMask });
    return escapeRayOpenStack.size !== 0;
  }

  private getVisibilityPolygon() {
    if (this.visibilityPolygonCache) {
      return this.visibilityPolygonCache;
    }
    
    const scene = this.entity.scene!;
    const entityShapes = this.getEntityShapes(scene);
    const lightBounds = this.getBounds();
    const panoramaVisibilityPolygon = new PanoramaVisibilityPolygon({
      fulcrum: this.transform.position,
      obsticles: entityShapes,
      externalMasks: [lightBounds],
    });

    return this.visibilityPolygonCache = panoramaVisibilityPolygon;
  }
}