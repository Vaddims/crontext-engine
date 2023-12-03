import { Transformator } from "objectra";
import { Component, EntityTransform, Scene, Transform, Vector } from "../core";
import { Color } from "../core/color";
import { Shape } from "../core/shape";
import { Rectangle } from "../shapes/rectangle";
import BuildinComponent from "../core/buildin-component";
import { TickMemoizationPlugin } from "../core/cache/plugins/tick-memoization.capl";
import { SpatialPartition } from "../core/spatial-partition/spatial-partition";
import { SpatialPartitionCluster } from "../core/spatial-partition/spatial-partition-cluster";

export enum LocalCacheKey {
  /** Instance based cache for vertices */
  RVP = 'relativeVerticesPosition',
  /** Spatial partition for mesh renderer shapes */
  MRSP = 'MeshRenderer:SpatialPartition',
  /** Spatial partition clusters applied on each bound vertex */
  MRSPC = 'MeshRenderer:SpatialPartitionClusters',
}

@Transformator.Register()
export class MeshRenderer extends BuildinComponent {
  public shape: Shape = new Rectangle();
  public color: Color = Color.black;

  [Component.onAwake]() {
    this.cacheManager.controller[LocalCacheKey.RVP].setPlugin(new TickMemoizationPlugin(() => (
      this.shape.withTransform(Transform.setRotation(this.transform.rotation).setScale(this.transform.scale).setPosition(this.transform.position))
    )));
    
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

  public static [Scene.onInstantiation](scene: Scene) {
    const spatialPartition = new SpatialPartition<MeshRenderer>(3);
    scene.cache[LocalCacheKey.MRSP] = spatialPartition;

    const components = scene.getComponentsOfType(MeshRenderer);
    for (const meshRenderer of components) {
      meshRenderer.recacheSpatialPartition(spatialPartition);
    }
  }
}

export namespace MeshRenderer {
  export const CacheKey = LocalCacheKey;
}