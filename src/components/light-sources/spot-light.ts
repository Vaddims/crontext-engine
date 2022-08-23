import { Color, Ray, Segment, Shape, ShapeIntersection, Transform, Vector } from "../../core";
import { Gizmos } from "../../core/gizmos";
import { VisibilityPolygon } from "../../core/visibility-polygon";
import { SimulationRenderer } from "../../renderers";
import { SimulationRenderingPipeline } from "../../rendering-pipelines";
import { Rectangle } from "../../shapes";
import { LightSource } from "../light";

interface RaycastCheckpoint {
  exposed: Vector,
  endpoint?: Vector,
  endpointSegment?: Segment,
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
    const path = this.getMaskInfo(renderer);

    const { remove: removeMask } = simulationRenderingPipeline.createMask(Array.from(path));

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
    

    const path = this.getMaskInfo(gizmos.renderer);

    // const {
    //   filteredCheckpointRaycasts,
    //   maskPath,
    //   shapeInterimVertices,
    //   checkpointVertices,
    //   lightBoundsInterimVertices,
    //   positiveResolution,
    //   negativeResolution,
    //   negativeAngle,
    //   positiveAngle,
    //   basisAngle
    // } = resolution ?? {};
    
    const lineColor = new Color(0, 0, 255, 0.1);
    const vertexColor = Color.blue;
    const vertexHighlightRadius = 0.1

    // if (positiveResolution && negativeResolution) {
    //   gizmos.renderFixedCircle(positiveResolution.intersectionPosition, 0.1, Color.red);
    //   gizmos.renderFixedCircle(negativeResolution.intersectionPosition, 0.1, Color.red);
    //   // console.log(positiveResolution.intersectionPosition + ' ' + negativeResolution.intersectionPosition)
    // }
    // gizmos.highlightVertices(new Rectangle().withScale(this.range).withOffset(this.transform.position).vertices, new Color(0, 0, 255, 0.1))
    
    // if (maskPath) {
    //   gizmos.highlightVertices(Array.from(maskPath), Color.blue);
    // }

    if (path) {
      for (let i = 0; i < path.length; i++) {
        gizmos.renderLine(this.transform.position, path[i], lineColor);
        gizmos.renderFixedText(path[i], `${i + 1}`, 0.35, Color.red);
      }
    }

    // if (checkpointRaycasts) {
    //   for (const c of checkpointRaycasts) {
    //     gizmos.renderLine(this.transform.position, c.exposed, lineColor);
    //     if (c.endpoint) {
    //       gizmos.renderLine(c.exposed, c.endpoint, lineColor);
    //     }
    //   }
    // }

    if (this.rerateFPS) {
      this.rerateFPS = false;
      this.fps = Math.min(60, Number(gizmos.renderer.fps.toFixed(0)));
    }
    
    const list = [
      `${this.fps} fps`,
      // '',
      // `${checkpointVertices?.length ?? 0} total checkpoint vertices`,
      // `${shapeInterimVertices?.length ?? 0} entity to entity overlaping vertices`,
      // `${lightBoundsInterimVertices?.length ?? 0} entity overlap vertices with light bounds`,
      // '',
      // `${filteredCheckpointRaycasts?.length ?? 0} mask checkpoint raycasts`,
      // `${maskPath?.length ?? 0} mask path vertices`,
      // `${basisAngle?.toFixed(2)} basis angle`,
      // `${negativeAngle} neg angle`,
      // `${(positiveAngle)} pos angle`
    ]

    for (let i = 0; i < list.length; i++) {
      gizmos.renderStaticText(new Vector(-16, 3 - i / 2), list[i], 0.5);
    }
  }

  private getEntityShapes(lightBounds: Shape) {
    const scene = this.entity.getScene();

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
    const segmentVertices = new Map<Segment, Vector[]>();
    const addSegmentVertices = (segment: Segment, ...additionalVertices: Vector[]) => {
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

  private getMaskInfo(renderer: SimulationRenderer) {
    const lightBounds = this.getBounds();    
    const entityShapes = this.getEntityShapes(lightBounds);

    return VisibilityPolygon.createSector({
      direction: Vector.fromAngle(this.direction.rotation() + this.transform.rotation),
      angle: this.angle,
      nearPlane: this.nearPlane,
      fulcrum: this.transform.position,
      obsticles: entityShapes,
      externalMasks: [lightBounds],
    }).pathCreator.path;
  }
}