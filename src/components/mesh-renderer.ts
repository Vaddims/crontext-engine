import { Transformator } from "objectra";
import { Component, EntityTransform, Input, Ray, Renderer, Scene, Transform, Vector } from "../core";
import { Color } from "../core/color";
import { Shape } from "../core/shape";
import { Rectangle } from "../shapes/rectangle";
import BuildinComponent from "../core/buildin-component";
import { TickMemoizationPlugin } from "../core/cache/plugins/tick-memoization.capl";
import { SpatialPartition } from "../core/spatial-partition/spatial-partition";
import { SpatialPartitionCluster } from "../core/spatial-partition/spatial-partition-cluster";
import { Gizmos } from "../core/gizmos";
import { BoundingBox } from "../shapes/bounding-box";
import { TickRestorePlugin } from "../core/cache/plugins/tick-restore.capl";

export enum LocalCacheKey {
  /** Instance based cache for vertices */
  RVP = 'relativeVerticesPosition',
  /** Spatial partition for mesh renderer shapes */
  MRSP = 'MeshRenderer:SpatialPartition',
  /** Spatial partition clusters applied on each bound vertex */
  MRSPC = 'MeshRenderer:SpatialPartitionClusters',
}

@Transformator.Register()
export class MeshRenderer extends BuildinComponent implements Input.ComponentActions {
  public shape: Shape = new Rectangle();
  public color: Color = Color.black;
  public opacity = 1;

  public outlineColor: Color = Color.black;
  public outlineWidth = 0;
  public outlineOpacity = 0;

  [Component.onAwake]() {
    this.cacheManager.controller[LocalCacheKey.RVP].setPlugin(new TickMemoizationPlugin(() => (
      this.shape.withTransform(Transform.setRotation(this.transform.rotation).setScale(this.transform.scale).setPosition(this.transform.position))
    )));

    this.cacheManager.controller.transformationAnchors.setPlugin(new TickRestorePlugin());
    
    this.recacheSpatialPartition(this.getCachedSpatialPartition());
  }

  private getCachedSpatialPartition() {
    const spatialPartition: SpatialPartition<MeshRenderer> = this.entity.scene!.cache[LocalCacheKey.MRSP];
    if (!spatialPartition) {
      throw new Error('Spatial partition not found in scene cache');
    }

    return spatialPartition;
  }

  [EntityTransform.onChange]() {
    delete this.cache[LocalCacheKey.RVP];
    this.recacheSpatialPartition(this.getCachedSpatialPartition());
  }

  [Component.onDestroy]() {
    this.removeSpatialPartitionDependents(this.getCachedSpatialPartition());
  }

  public relativeVerticesPosition() {
    return (<Shape>this.cache[LocalCacheKey.RVP]).vertices;
  }

  public recacheSpatialPartition(spatialPartition: SpatialPartition<MeshRenderer>) {
    const getShapeAppropriateClusterLevel = (shape: Shape) => {
      const epsilonBias = 0.01;
      const boundsScale = shape.bounds.getScale();
      const maxScale = Math.max(boundsScale.x, boundsScale.y);
      const clusterLevel = Math.ceil(Math.baseLog(spatialPartition.clusterOpacity, maxScale + epsilonBias));
      return clusterLevel;
    }

    const getBelongingClusters = (bounds: Shape, level: number) => {
      const belongingClusters = [];
      boundloop: for (let i = 0; i < bounds.vertices.length; i++) {
        const cluster = SpatialPartitionCluster.createFromPoint(bounds.vertices[i], level, spatialPartition.clusterOpacity);
        if (i === 0) {
          belongingClusters.push(cluster);
          continue;
        }

        for (const belongingCluster of belongingClusters) {
          if (cluster.identifier === belongingCluster.identifier) {
            continue boundloop;
          }
        }

        belongingClusters.push(cluster);
      }

      return belongingClusters;
    }

    const meshRendererShape = <Shape>this.cache[LocalCacheKey.RVP];
    const clusterLevel = getShapeAppropriateClusterLevel(meshRendererShape);

    const clusters: SpatialPartitionCluster[] = this.entity.cache[LocalCacheKey.MRSPC] ?? [];
    delete this.entity.cache[LocalCacheKey.MRSPC];

    // TODO Delete only needed elements
    // delete clusters that the element occupais
    for (const boundCluster of clusters) {
      spatialPartition.modifyClusterElements(boundCluster, (elements) => elements.delete(this));
    }

    // TODO Merge with the above iteration
    const newBoundClusters = getBelongingClusters(meshRendererShape.bounds, clusterLevel);
    for (const boundCluster of newBoundClusters) {
      spatialPartition.injectBranch(boundCluster, [this]);
    }
    
    this.entity.cache[LocalCacheKey.MRSPC] = newBoundClusters;
  }

  public removeSpatialPartitionDependents(spatialPartition: SpatialPartition<MeshRenderer>) {
    const cache = this.entity.cache;
    const clusters: SpatialPartitionCluster[] = cache[LocalCacheKey.MRSPC] ?? [];
    delete cache[LocalCacheKey.MRSPC];

    // delete clusters that the element occupais
    for (const boundCluster of clusters) {
      spatialPartition.modifyClusterElements(boundCluster, (elements) => {
        elements.delete(this);
      });
    }
  }

  public [Component.onGizmosRender](gizmos: Gizmos, isShadowSelected: boolean) {
    if (!isShadowSelected) {
      return;
    }

    const vertices = this.relativeVerticesPosition();

    gizmos.highlightVertices(vertices, Color.yellow);

    const o = gizmos.renderer.inspector.optic;
    if (this.shape instanceof Rectangle) {
      const ets = this.getEntityTransformedShape();
      const anchors: Shape[] = [];
      for (let i = 0; i < ets.vertices.length; i++) {
        const fixedAnchor = new Rectangle().withScale(.25).withOffset(ets.vertices[i]).withScale(o.scale)
        anchors.push(fixedAnchor);
      }

      for (const anchor of anchors) {
        gizmos.renderShape(new Rectangle().withScale(anchor.getScale()), anchor.arithmeticMean(), 0, Color.red);
      }

      this.cache.transformationAnchors = anchors;
    }
  }

  public transformOffsetFromTransformCenter = Vector.zero;
  public shapeTransformSelectedAnchor: number | null = null;
  public lastTransformMousePosition: Vector | null = null;

  public [Input.onMouseDown](event: MouseEvent, captures: Input.Mouse.Captures) {
    if (!captures.mostRelevantInspector) {
      return;
    }

    if (!captures.isSelectedAtInspector(captures.mostRelevantInspector, this.entity)) {
      return;
    }

    for (let i = 0; i < this.cache.transformationAnchors.length; i++) {
      const anchor = this.cache.transformationAnchors[i];

      const captureInScenePosition = captures.mostRelevantInspector.getCoordsInScenePosition();
      if (Ray.isPointInsideShape(anchor, captureInScenePosition)) {
        this.lastTransformMousePosition = captureInScenePosition;
        this.shapeTransformSelectedAnchor = i;

        this.transformOffsetFromTransformCenter = (<Shape>this.cache.transformationAnchors[i]).arithmeticMean().subtract(captureInScenePosition);
        captures.lockInspectorViewTransformation = true;
      }
    }
  }

  public [Input.onMouseMove](event: MouseEvent, captures: Input.Mouse.Captures): any {
    if (!captures.mostRelevantInspector) {
      return;
    }

    if (this.lastTransformMousePosition && this.shapeTransformSelectedAnchor !== null) {
      // TODO Handle rotated objects
      const newSelectedAnchorPosition = captures.mostRelevantInspector.getCoordsInScenePosition().add(this.transformOffsetFromTransformCenter)
      const anchorVertexIndex = (this.shapeTransformSelectedAnchor + 2) % 4;
      const anchorVertexPosition = (<Shape>this.cache.transformationAnchors[anchorVertexIndex]).arithmeticMean();
      const newBoxScale = newSelectedAnchorPosition.subtract(anchorVertexPosition);
      const newBoxPosition = anchorVertexPosition.add(newBoxScale.divide(2));

      this.transform.position = newBoxPosition;
      this.transform.scale = Vector.abs(newBoxScale);

      captures.lockInspectorViewTransformation = true;
    }
  }

  public [Input.onMouseUp](event: MouseEvent, captures: Input.Mouse.Captures): any {
    if (this.lastTransformMousePosition || this.shapeTransformSelectedAnchor !== null) {
      this.lastTransformMousePosition = null;
      this.shapeTransformSelectedAnchor = null;

      captures.lockInspectorViewTransformation = true;
    }
  }
  

  public static [Scene.onInstantiation](scene: Scene) {
    const spatialPartition = new SpatialPartition<MeshRenderer>(3);
    scene.cache[LocalCacheKey.MRSP] = spatialPartition;

    const components = scene.getComponentsOfType(MeshRenderer);
    for (const meshRenderer of components) {
      meshRenderer.recacheSpatialPartition(spatialPartition);
    }
  }

  public getEntityTransformedShape() {
    return this.shape.withTransform(this.transform.toPureLocalTransform());
  }
}

export namespace MeshRenderer {
  export const CacheKey = LocalCacheKey;
}