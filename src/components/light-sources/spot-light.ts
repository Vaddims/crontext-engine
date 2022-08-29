import { Color, Ray, Shape, Transform, Vector } from "../../core";
import { Gizmos } from "../../core/gizmos";
import { VisibilityPolygon } from "../../core/visibility-polygon";
import { SimulationRenderer } from "../../renderers";
import { SimulationRenderingPipeline } from "../../rendering-pipelines";
import { Rectangle } from "../../shapes";
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

export class SpotLight extends LightSource {
  public range = 30;
  public angle = Math.PI / 4;
  public direction = Vector.right;
  public nearPlane = 0.25;

  public color = Color.white;
  private readonly raycastInaccuracy = 0.00001;

  render(simulationRenderingPipeline: SimulationRenderingPipeline) {
    const { renderer } = simulationRenderingPipeline;
    const visibilityPolygon = this.getVisibilityPolygon(renderer);

    const { remove: removeMask } = simulationRenderingPipeline.createMask(visibilityPolygon.pathCreator.path);

    simulationRenderingPipeline.renderRadialGradient(this.transform.position, this.range, [{
      offset: 0,
      color: this.color,
    }, {
      offset: 0.5,
      color: Color.transparent,
    }]);

    removeMask();
  }

  gizmosRender(gizmos: Gizmos) {
    const visibilityPolygon = this.getVisibilityPolygon(gizmos.renderer);
    const { path } = visibilityPolygon.pathCreator;
    
    const lineColor = new Color(0, 0, 255, 0.1);

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

    if (visibilityPolygon.checkpointRaycasts) {
      for (const checkpointRaycast of visibilityPolygon.checkpointRaycasts) {
        gizmos.renderLine(this.transform.position, checkpointRaycast.exposed, lineColor);
        if (checkpointRaycast.endpoint) {
          gizmos.renderLine(checkpointRaycast.exposed, checkpointRaycast.endpoint, lineColor);
        }
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
      `${this.angle.toFixed(2)} basis angle`,
    ]

    for (let i = 0; i < list.length; i++) {
      gizmos.renderStaticText(new Vector(-16, 3 - i / 2), list[i], 0.5);
    }
  }

  private getEntityShapes(lightBounds: Shape) {
    const scene = this.entity.scene!;

    const entityShapes: Shape[] = [];
    for (const entity of scene) {
      const componentInstance = entity.components.find(this.physicalRenderingDependence);
      if (!componentInstance) {
        continue;
      }
      
      const positionedVertices = componentInstance.relativeVerticesPosition();
      const positionedShape = new Shape(positionedVertices);

      const entityBounds = new Shape(positionedVertices).bounds;
      if (!boundsOverlaping(entityBounds, lightBounds)) {
        continue;
      }

      entityShapes.push(positionedShape);
    }

    return entityShapes;
  }

  public getBounds() {
    const scale = Vector.one.multiply(this.range);
    const boundsTransform = Transform.setScale(scale).setPosition(this.transform.position)
    return new Rectangle().withTransform(boundsTransform);
  }

  public getSegmentVerticesUtils() {
    // To keep track of the vertecies that belongs to specific shape segments (Is needed for mask connection)
    const segmentVertices = new Map<Shape.Segment, Vector[]>();
    const addSegmentVertices = (segment: Shape.Segment, ...additionalVertices: Vector[]) => {
      const vertices = segmentVertices.get(segment);
      if (!vertices) {
        segmentVertices.set(segment, [...additionalVertices]);
        return;
      }

      vertices.push(...additionalVertices);
    }

    const verticesShareSegment = (a: Vector, b: Vector) => 
      Array.from(segmentVertices.values()).some(vertices => vertices.includes(a) && vertices.includes(b));

    return {
      segmentVertices,
      addSegmentVertices,
      verticesShareSegment,
    }
  }

  public overlapsShape(shapes: Shape[], shapeMask: Shape[]) {;
    const escapeRay = Ray.escape(this.transform.position);
    const escapeRayOpenStack = escapeRay.researchOpenStacks(shapes, { shapeMask: shapeMask });
    return escapeRayOpenStack.size !== 0;
  }

  private getVisibilityPolygon(renderer: SimulationRenderer) {
    const lightBounds = this.getBounds();    
    const entityShapes = this.getEntityShapes(lightBounds);

    return VisibilityPolygon.createSector({
      direction: Vector.fromAngle(this.direction.rotation() + this.transform.rotation),
      angle: this.angle,
      nearPlane: this.nearPlane,
      fulcrum: this.transform.position,
      obsticles: entityShapes,
      externalMasks: [lightBounds],
    });
  }
}