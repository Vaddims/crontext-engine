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
import { TickRestorePlugin } from "../core/cache/plugins/tick-restore.capl";
import { SimulationInspectorRenderer } from "../renderers";

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

    gizmos.highlightVertices(vertices, gizmos.colorPallete.selectedOutline);

    const optic = gizmos.renderer.inspector.optic;
    if (this.shape instanceof Rectangle) {
      const ets = this.getEntityTransformedShape();
      const anchors: Shape[] = [];
      const ANCHOR_SCALE = .3;
      for (let i = 0; i < ets.vertices.length; i++) {
        const fixedAnchor = new Rectangle().withScale(ANCHOR_SCALE).withOffset(ets.vertices[i]).withScale(optic.scale)
        anchors.push(fixedAnchor);
      }

      if (this.color.alpha < .5 || this.opacity < .5) {
        gizmos.uni_renderShape(ets, gizmos.colorPallete.selectedOutline.withAlpha(0.2));
      }

      if (this.shapeTransformSelectedAnchor !== null) {
        const anchor = anchors[this.shapeTransformSelectedAnchor];
        gizmos.renderFixedDisk(anchor.arithmeticMean(), ANCHOR_SCALE / 2, gizmos.colorPallete.selectedAccessories);
        gizmos.renderFixedCircle(anchor.arithmeticMean(), ANCHOR_SCALE / 2, Color.white);
        this.cache.transformationAnchors = anchors;
        return;
      }

      const mustFitInLine = 3;
      const a = ets.vertices[0].subtract(ets.vertices[1]);
      const b = ets.vertices[1].subtract(ets.vertices[2]);
      const min = Vector.min(a, b)
      const shouldRenderAnchors = min.magnitude >= anchors[0].getScale().x * (mustFitInLine - 1); // divide by 2 because the anchor is offseted by half of its scale

      if (!shouldRenderAnchors) {
        return;
      }

      for (const anchor of anchors) {
        gizmos.renderFixedDisk(anchor.arithmeticMean(), ANCHOR_SCALE / 2, gizmos.colorPallete.selectedAccessories);
        gizmos.renderFixedCircle(anchor.arithmeticMean(), ANCHOR_SCALE / 2, Color.white);
      }

      this.cache.transformationAnchors = anchors;
    }
  }

  public transformOffsetFromTransformCenter = Vector.zero;
  public shapeTransformSelectedAnchor: number | null = null;
  public lastTransformMousePosition: Vector | null = null;

  public [Input.onMouseDown](interaction: Input.Mouse.Interaction) {
    const { captures, renderer } = interaction;

    if (!this.cache.transformationAnchors) {
      return;
    }

    if (renderer.constructor.name !== 'SimulationInspectorRenderer') {
      return;
    }
    
    const inspectorRenderer = <SimulationInspectorRenderer>renderer;
    if (!inspectorRenderer.inspector.selectedEntities.has(this.entity)) {
      return;
    }

    for (let i = 0; i < this.cache.transformationAnchors.length; i++) {
      const anchor = this.cache.transformationAnchors[i];

      const scenePositionOfCapture = captures.main.getAsScenePosition();
      if (Ray.isPointInsideShape(anchor, scenePositionOfCapture)) {
        this.lastTransformMousePosition = scenePositionOfCapture;
        this.shapeTransformSelectedAnchor = i;

        this.transformOffsetFromTransformCenter = (<Shape>this.cache.transformationAnchors[i]).arithmeticMean().subtract(scenePositionOfCapture);
        renderer.cache[Input.onMouseDown] = false;
      }
    }
  }

  public [Input.onMouseMove](interaction: Input.Mouse.Interaction) {
    const { captures, renderer } = interaction;

    if (this.lastTransformMousePosition && this.shapeTransformSelectedAnchor !== null) {
      const getAnchorPosition = (anchorIndex: number) => {
        return (<Shape>this.cache.transformationAnchors[anchorIndex]).arithmeticMean()
      }
      
      const newSelectedAnchorPosition = captures.main.getAsScenePosition().add(this.transformOffsetFromTransformCenter);
      const oppositeOfSelectedAnchorIndex = (this.shapeTransformSelectedAnchor + 2) % 4;
      const oppositeOfSelectedAnchorPosition = getAnchorPosition(oppositeOfSelectedAnchorIndex);

      const newSelectedAnchorPositionRotated = newSelectedAnchorPosition.rotate(-this.transform.rotation);
      const oppositeOfSelectedAnchorPositionRotated = oppositeOfSelectedAnchorPosition.rotate(-this.transform.rotation);


      const newBoxScale = newSelectedAnchorPositionRotated.subtract(oppositeOfSelectedAnchorPositionRotated);
      const newBoxPosition = oppositeOfSelectedAnchorPositionRotated.add(newBoxScale.divide(2));

      const finalBoxPosition = newBoxPosition.rotate(this.transform.rotation);

      this.transform.position = finalBoxPosition;
      this.transform.scale = Vector.abs(newBoxScale);

      this.lastTransformMousePosition = captures.main.getAsScenePosition();
      renderer.cache[Input.onMouseMove] = false;
    }
  }

  // public [Input.onMouseMove](interaction: Input.Mouse.Interaction) {
  //   const { captures, renderer } = interaction;
  
  //   if (!captures.main) {
  //     return;
  //   }
  
  //   if (this.lastTransformMousePosition && this.shapeTransformSelectedAnchor !== null && this.cache.transformationAnchors) {
  //     const delta = captures.main.getAsScenePosition().subtract(this.lastTransformMousePosition);
  
  //     // Calculate the direction from the center of the box to the selected anchor
  //     const anchorDirection = (<Shape>this.cache.transformationAnchors[this.shapeTransformSelectedAnchor]).arithmeticMean().subtract(this.entity.transform.position).normalized;
  
  //     // Project the delta onto the anchor direction to get the movement in the direction of the anchor
  //     const projectedDelta = delta.projectOnto(anchorDirection); // Vector.projection(anchorDirection, delta) // delta.projectOnto(anchorDirection);
  
  //     // Calculate the new size of the box based on the projected mouse movement
  //     const newSize = this.entity.transform.scale.add(projectedDelta.multiply(2));
  
  //     // Calculate the position of the opposite anchor
  //     const oppositeAnchorIndex = (this.shapeTransformSelectedAnchor + 2) % 4;
  //     const oppositeAnchorPosition = (<Shape>this.cache.transformationAnchors[oppositeAnchorIndex]).arithmeticMean();
  
  //     // Calculate the new position of the box based on the position of the opposite anchor and the new size
  //     const newPosition = oppositeAnchorPosition.add(newSize.divide(2).add(anchorDirection));
  
  //     // Update the size and position of the box
  //     this.entity.transform.scale = newSize;
  //     this.entity.transform.position = newPosition;
  
  //     // Update the last mouse position
  //     this.lastTransformMousePosition = captures.main.getAsScenePosition();
  //     renderer.cache[Input.onMouseMove] = false;
  //   }
  // }

  public [Input.onMouseUp](interaction: Input.Mouse.Interaction) {
    const { renderer } = interaction;

    if (this.lastTransformMousePosition || this.shapeTransformSelectedAnchor !== null && this.shapeTransformSelectedAnchor) {
      this.lastTransformMousePosition = null;
      this.shapeTransformSelectedAnchor = null;

      renderer.cache[Input.onMouseUp] = false;
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