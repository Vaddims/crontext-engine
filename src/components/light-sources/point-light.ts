import { Transformator } from "objectra";
import { Color, Component, Entity, Ray, Scene, Shape, Transform, Vector } from "../../core";
import { Gizmos } from "../../core/gizmos";
import { VisibilityPolygon } from "../../core/visibility-polygon";
import { PanoramaVisibilityPolygon } from "../../core/visibility-polygons/panorama-visibility-polygon";
import { SimulationRenderingPipeline } from "../../rendering-pipelines";
import { Rectangle } from "../../shapes";
import { Light } from "../light";
import { rotatedOffsetPosition } from "../../utils";

@Transformator.Register()
export class PointLight extends Light {
  public renderLight = true;
  public renderReflections = true;
  public renderBloomOverflows = true;

  public recache = true;
  public range = 20;
  public color = Color.white;
  public ignoreOverlapEntity = false;
  public internalMeshBloom = .2;
  public internalBloomBlur = 3;
  public reflectionBloomBlur = 10;
  
  private readonly raycastInaccuracy = 0.00001;

  @Transformator.Exclude()
  public visibilityPolygonCache: VisibilityPolygon | null = null;

  constructor(entity: Entity) {
    super(entity)
  }

  start() {

  }

  render(simulationRenderingPipeline: SimulationRenderingPipeline) {
    const { scene } = this.entity;
    if (!scene) {
      return;
    }
    
    if (!this.ignoreOverlapEntity) {
      // TODO Optimize with culling clusters
      for (const shape of this.getEntityShapes(scene)) {
        const overlaping = Ray.isPointInsideShape(shape, this.transform.position);
        if (overlaping) {
          return;
        }
      }
    }

    this.recache = true;
    const visibilityPolygon = this.getVisibilityPolygon();
    this.recache = false;

    const { path } = visibilityPolygon;

    if (this.renderLight) {
      const { remove: removeMask } = simulationRenderingPipeline.createMask(path);

      simulationRenderingPipeline.renderRadialGradient(this.transform.position, this.range, [{
        offset: 0,
        color: this.color,
      }, {
        offset: 0.5,
        color: Color.createRelativeTransparent(this.color),
      }]);

      removeMask();
    }

    for (const projectionedSegments of visibilityPolygon.getObsticleFaceProjectionedSegments()) {
      const reversedProjectedSegments = [projectionedSegments[1], projectionedSegments[0]] as Shape.Segment;

      const width = projectionedSegments[1].subtract(projectionedSegments[0])
      const center = Shape.getSegmentCenter(reversedProjectedSegments);
      const normal = Shape.getSegmentNormal(reversedProjectedSegments);

      const antiNormal = normal.multiply(Vector.reverse);

      const lightToSegmentCenter = center.subtract(this.transform.position);
      const a = lightToSegmentCenter.magnitude;
      const b = Math.min(Math.max(a / this.range * 2, 0), 1);
      const c = 1 - b;

      const dot = Vector.dot(antiNormal, lightToSegmentCenter.normalized);

      if (this.renderReflections) {
        const { remove: r2b } = simulationRenderingPipeline.createBlur(this.reflectionBloomBlur);
        simulationRenderingPipeline.renderLinearGradient(center, normal, width.magnitude, [
          {
            color: this.color.withAlpha(dot * (c * 2)),
            offset: 0,
          },
          {
            color: this.color.withAlpha(0),
            offset: .7,
          }
        ])
  
        r2b();
      }

      if (this.renderBloomOverflows) {
        const { remove: r1b } = simulationRenderingPipeline.createBlur(this.internalBloomBlur);
        simulationRenderingPipeline.renderLinearGradient(center, antiNormal, width.magnitude, [
          {
            color: this.color.withAlpha(dot * this.internalMeshBloom * (c * 2)),
            offset: 0,
          },
          {
            color: this.color.withAlpha(0),
            offset: .7,
          }
        ])
        r1b();
      }
    }
  }


  public [Component.onGizmosRender](gizmos: Gizmos) {
    const visibilityPolygon = this.getVisibilityPolygon();
    const { path } = visibilityPolygon;
    
    const lineColor = new Color(0, 0, 255, 0.1);
    const vertexColor = Color.blue;
    const vertexHighlightRadius = 0.1;

    gizmos.useMask(path, () => {
      gizmos.renderCircle(this.transform.position, this.range / 2, Color.blue);
    });
    
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

    for (const projectionedSegments of visibilityPolygon.getObsticleFaceProjectionedSegments()) {
      gizmos.renderLine(projectionedSegments[0], projectionedSegments[1], Color.red, 4)
      const reversedProjectedSegments = [projectionedSegments[1], projectionedSegments[0]] as Shape.Segment;

      const center = Shape.getSegmentCenter(reversedProjectedSegments);
      const normal = Shape.getSegmentNormal(reversedProjectedSegments).normalized;

      const antiNormal = normal.multiply(Vector.reverse).normalized;


      const lightToSegmentCenter = center.subtract(this.transform.position);
      const a = lightToSegmentCenter.magnitude;
      const b = Math.min(Math.max(a / this.range * 2, 0), 1);
      const c = 1 - b;

      const dot = Vector.dot(antiNormal, center.subtract(this.transform.position).normalized);

      gizmos.renderDirectionalLine(center, normal.multiply(dot, c), Color.red);
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
    if (!this.recache && this.visibilityPolygonCache) {
      return this.visibilityPolygonCache;
    }
    
    const scene = this.entity.scene!;
    const entityShapes = this.getEntityShapes(scene);
    const lightBounds = this.getBounds();

    if (this.usePhysicalRendering) {
      const physicalBasedPanoramaVisibilityPolygon = new PanoramaVisibilityPolygon({
        fulcrum: this.transform.position,
        obsticles: entityShapes,
        externalMasks: [lightBounds],
      });

      return this.visibilityPolygonCache = physicalBasedPanoramaVisibilityPolygon;
    }

    const simplePanoramaVisibilityPolygon = new PanoramaVisibilityPolygon({
      fulcrum: this.transform.position,
      obsticles: [],
      externalMasks: [lightBounds],
    });

    return this.visibilityPolygonCache = simplePanoramaVisibilityPolygon;
  }
}