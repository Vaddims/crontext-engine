import { Color, Entity, Optic, Ray, Renderer, RenderingPipeline, Scene, Segment, Shape, ShapeIntersection, Transform, Vector } from "../../core";
import { Gizmos } from "../../core/gizmos";
import { VisibilityPolygon } from "../../core/visibility-polygon";
import { SimulationRenderer } from "../../renderers";
import { SimulationRenderingPipeline } from "../../rendering-pipelines";
import { Rectangle } from "../../shapes";
import { lineWithLineIntersection, rotatedOffsetPosition, segmentWithSegmentIntersection } from "../../utils";
import { Camera } from "../camera";
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
    const { renderer } = simulationRenderingPipeline;
    const maskPath = this.getVisibilityPolygon(renderer);
    
    // const { maskPath } = res;
    if (!maskPath) {
      return;
    }

    const { remove: removeMask } = simulationRenderingPipeline.createMask(Array.from(maskPath));

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
    const maskPath = this.getVisibilityPolygon(gizmos.renderer);

    // const {
    //   checkpointRaycasts,
    //   maskPath,
    //   shapeInterimVertices,
    //   checkpointVertices,
    //   lightBoundsInterimVertices,
    // } = resolution ?? {};
    
    const lineColor = new Color(0, 0, 255, 0.1);
    const vertexColor = Color.blue;
    const vertexHighlightRadius = 0.1
    
    gizmos.highlightVertices(new Rectangle().withScale(this.range).withOffset(this.transform.position).vertices, new Color(0, 0, 255, 0.1))
    
    if (maskPath) {
      gizmos.highlightVertices(Array.from(maskPath), Color.blue);
    }

    if (maskPath) {
      for (let i = 0; i < maskPath.length; i++) {
        gizmos.renderLine(this.transform.position, maskPath[i], lineColor);
        gizmos.renderFixedText(maskPath[i], `${i + 1}`, 0.35, Color.red);
      }
    }

    if (this.rerateFPS) {
      this.rerateFPS = false;
      this.fps = Math.min(60, Number(gizmos.renderer.fps.toFixed(0)));
    }
    
    const list = [
      `${this.fps} fps`,
      '',
      // `${checkpointVertices?.length ?? 0} total checkpoint vertices`,
      // `${shapeInterimVertices?.length ?? 0} entity to entity overlaping vertices`,
      // `${lightBoundsInterimVertices?.length ?? 0} entity overlap vertices with light bounds`,
      // '',
      // `${checkpointRaycasts?.length ?? 0} mask checkpoint raycasts`,
      `${maskPath?.length ?? 0} mask path vertices`,
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

  private getVisibilityPolygon(renderer: SimulationRenderer) {
    if (this.frameMaskCache) {
      return this.frameMaskCache;
    }
    
    const scene = this.entity.getScene();
    const entityShapes = this.getEntityShapes(scene);
    const lightBounds = this.getBounds();
    const visibilityPolygon = VisibilityPolygon.createPanorama({
      fulcrum: this.transform.position,
      obsticles: entityShapes,
      externalMasks: [lightBounds],
    });

    this.frameMaskCache = visibilityPolygon.pathCreator.path;

    return visibilityPolygon.pathCreator.path;



    /*

    const visibleEntityShapes = entityShapes.filter(shape => VisibilityPolygon.shapeOverlapsVisibilityBounds(shape, lightBounds));
    const visibleEntityShapeSegments = visibleEntityShapes.map(shape => shape.segments).flat();
    
    // Check if shape is overlaping the light
    if (this.overlapsShape(visibleEntityShapes, [lightBounds])) {
      return;
    }

    const checkpointVertices = visibleEntityShapes.map(shape => shape.vertices).flat().concat(lightBounds.vertices);
    const segmentShareMap = new VisibilityPolygon.SegmentShareMap(...lightBounds.segments, ...visibleEntityShapeSegments);

    // Vertices which are intersects of entity segments
    const shapesWithLightBoundsIntersections = visibleEntityShapes.map(shape => Shape.intersections(lightBounds, shape)).flat();
    const shapeWithShapeIntersections: ShapeIntersection[] = [];
    for (let i = 0; i < visibleEntityShapes.length; i++) {
      for (let j = i + 1; j < visibleEntityShapes.length; j++) {
        const intersection = Shape.intersections(visibleEntityShapes[i], visibleEntityShapes[j]);
        if (!intersection) {
          continue;
        }
        
        shapeWithShapeIntersections.push(...intersection);
      }
    }
    
    const lightBoundsInterimVertices = shapesWithLightBoundsIntersections.map(intersection => intersection.position);
    const shapeInterimVertices = shapeWithShapeIntersections.map(intersection => intersection.position);
    checkpointVertices.push(...lightBoundsInterimVertices, ...shapeInterimVertices);
    
    const intersections = [...shapesWithLightBoundsIntersections, ...shapeWithShapeIntersections];
    for (const intersection of intersections) {
      segmentShareMap.addHolders(intersection.position, intersection.segmentHolders);
    }

    // Create raycast checkpoints
    const shapes: Shape[] = [lightBounds, ...visibleEntityShapes];
    const checkpointRaycasts = VisibilityPolygon.createRaycastCheckpoints({
      fulcrum: this.transform.position,
      entityShapes: visibleEntityShapes,
      lightBoundsInterimVertices,
      shapeInterimVertices,
      checkpointVertices,
      segmentShareMap,
      lightBounds,
      shapes,
    });

    for (const checkpointRaycast of checkpointRaycasts) {
      const { endpoint, endpointSegment } = checkpointRaycast;
      if (endpoint && endpointSegment) {
        segmentShareMap.add(endpointSegment, endpoint)
      }
    }

    const maskPath: Vector[] = [];
    const relativeCheckpointRotation = (vertex: Vector) => vertex.subtract(this.transform.position).rotation();
    checkpointRaycasts.sort((a, b) => relativeCheckpointRotation(a.exposed) - relativeCheckpointRotation(b.exposed));

    const visibilityPolygonPathCreator = new VisibilityPolygon.PathCreator(segmentShareMap);

    // Create mask path
    for (let i = 0; i < checkpointRaycasts.length; i++) {
      const currentCheckpointRaycast = checkpointRaycasts[i];
      const previousCheckpointRaycast = checkpointRaycasts.at(i - 1);

      if (!previousCheckpointRaycast) {
        throw new Error(`previousCheckpointRaycast doesn't exist`);
      }

      if (visibilityPolygonPathCreator.exposedConnection(currentCheckpointRaycast, previousCheckpointRaycast)) {
        continue;
      }

      if (visibilityPolygonPathCreator.endpointConnection(currentCheckpointRaycast, previousCheckpointRaycast)) {
        continue;
      }

      if (visibilityPolygonPathCreator.increasingConnection(currentCheckpointRaycast, previousCheckpointRaycast)) {
        continue;
      }

      if (visibilityPolygonPathCreator.decreasingConnection(currentCheckpointRaycast, previousCheckpointRaycast)) {
        continue;
      }
    }

    return this.frameMaskCache = visibilityPolygonPathCreator.path;
    */








    // return {
    //   lightBounds,
    //   checkpointVertices,
    //   checkpointRaycasts,
    //   shapeInterimVertices,
    //   lightBoundsInterimVertices,
    //   maskPath,
    // };
  }
}