import { Transformator } from "objectra";
import { Color, Component, Ray, Shape, Transform, Vector } from "../../core";
import { Gizmos } from "../../core/gizmos";
import { VisibilityPolygon } from "../../core/visibility-polygon";
import { SectorVisibilityPolygon } from "../../core/visibility-polygons/sector-visibility-polygon";
import { SimulationRenderer } from "../../renderers";
import { SimulationRenderingPipeline } from "../../rendering-pipelines";
import { Rectangle } from "../../shapes";
import { LightSource } from "../light";

interface RaycastCheckpoint {
  exposed: Vector,
  endpoint?: Vector,
  endpointSegment?: Shape.Segment,
}

@Transformator.Register()
export class SpotLight extends LightSource {
  public range = 30;
  public angle = Math.PI / 4;
  public direction = Vector.right;
  public nearPlane = 0.25;

  public color = Color.white;
  private readonly raycastInaccuracy = 0.00001;

  @Transformator.Exclude()
  public visibilityPolygonCache: VisibilityPolygon | null = null;

  render(simulationRenderingPipeline: SimulationRenderingPipeline) {
    const { renderer } = simulationRenderingPipeline;
    const visibilityPolygon = this.getVisibilityPolygon(renderer);

    const { remove: removeMask } = simulationRenderingPipeline.createMask(visibilityPolygon.path);
    
    simulationRenderingPipeline.renderRadialGradient(this.transform.position, this.range, [{
      offset: 0,
      color: this.color,
    }, {
      offset: 0.5,
      color: Color.createRelativeTransparent(this.color),
    }]);

    removeMask();
  }

  public [Component.onGizmosRender](gizmos: Gizmos) {
    const visibilityPolygon = this.getVisibilityPolygon(gizmos.renderer);
    const { path } = visibilityPolygon;
    
    const lineColor = new Color(0, 0, 255, 0.1);

    gizmos.highlightVertices(new Rectangle().withScale(this.range).withOffset(this.transform.position).vertices, new Color(0, 0, 255, 0.1))
    
    gizmos.useMask(path, () => {
      gizmos.renderCircle(this.transform.position, this.range / 2, Color.blue);
    });

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

    // for (const [ shareSegment, ee ] of visibilityPolygon.) {
    //   for (const visibleSegment of visibilityPolygon.visibleObsticleSegments) {
    //     if (shareSegment === visibleSegment) {
    //       gizmos.renderLine(shareSegment[0], shareSegment[1], Color.red);
    //     }
    //   }
    // }
    

    // visibilityPolygon..forEach(segment => {
    //   gizmos.renderLine(segment[0], segment[1], Color.red);
    // })
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
      if (!entityBounds.overlaps(entityBounds)) {
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

    return new SectorVisibilityPolygon({
      direction: Vector.fromAngle(this.direction.rotation() + this.transform.rotation),
      angle: this.angle,
      nearPlane: this.nearPlane,
      fulcrum: this.transform.position,
      obsticles: entityShapes,
      externalMasks: [lightBounds],
    });
  }
}