import { Transformator } from "objectra";
import { Color, Component, EntityTransform, Scene, Shape, Transform, Vector } from "../core";
import { Collision } from "../core/collision";
import { Gizmos } from "../core/gizmos";
import { Rectangle } from "../shapes";
import type { CircleCollider } from "./colliders/circle-collider";
import BuildinComponent from "../core/buildin-component";
import { SpatialPartition } from "../core/spatial-partition/spatial-partition";
import { TickMemoizationPlugin } from "../core/cache/plugins/tick-memoization.capl";
import { SpatialPartitionCluster } from "../core/spatial-partition/spatial-partition-cluster";

export interface Collider {
  collisionDetection<T extends Collider>(collider: T): Collision<T> | null;
  penetrationResolution<T extends Collider>(collider: T): void;
  get position(): Vector;
}

enum LocalCacheKey {
  GPS = 'Collider:GloballyPositionedShape',
  CSP = 'Collider:SpatialPartition',
  CBSPC = 'Collider:Bound:SpatialPartitionClusters',
}

@Transformator.Register()
@Component.Abstract()
export class Collider extends BuildinComponent implements Collider {
  public shape: Shape = new Rectangle();
  public behaviour = Collider.Behaviour.Dynamic;

  [Component.onAwake]() {
    this.cacheManager.controller[LocalCacheKey.GPS].setPlugin(new TickMemoizationPlugin(() => (
      this.shape.withTransform(Transform.setRotation(this.transform.rotation).setScale(this.transform.scale).setPosition(this.transform.position))
    )));

    this.recacheSpatialPartition(this.getCachedSpatialPartition());
  }

  private getCachedSpatialPartition() {
    const spatialPartition: SpatialPartition<Collider> = this.entity.scene.cache[LocalCacheKey.CSP];
    if (!spatialPartition) {
      throw new Error('Spatial partition not found in scene cache');
    }

    return spatialPartition;
  }

  public get isDynamic() {
    return this.behaviour === Collider.Behaviour.Dynamic;
  }

  public get isTrigger() {
    return this.behaviour === Collider.Behaviour.Trigger;
  }

  public get isStatic() {
    return this.behaviour === Collider.Behaviour.Static;
  }

  public relativeVerticesPosition() {
    // const transformedShape = this.shape.withTransform(Transform.setRotation(this.transform.rotation).setScale(this.transform.scale));
    // return transformedShape.vertices.map(vertex => vertex.add(this.transform.position)) as readonly Vector[];
    return this.cache[LocalCacheKey.GPS].vertices;
  }

  public relativeShape() {
    return this.cache[LocalCacheKey.GPS];
    // return new Shape(this.relativeVerticesPosition());
  }

  static circleIntersect(circleA: CircleCollider, circleB: CircleCollider) {
    const distance = Vector.distance(circleA.position, circleB.position);
    const radii = circleA.scaledRadius + circleB.scaledRadius;

    // console.log(distance)
    if (distance >= radii) {
      return null;
    }

    const positionNormal = circleB.position.subtract(circleA.position).normalized;
    const penetrationDepth = radii - distance;

    return {
      positionNormal,
      penetrationDepth,
    }
  }

  [EntityTransform.onChange]() {
    delete this.cache[LocalCacheKey.GPS];
    this.recacheSpatialPartition(this.getCachedSpatialPartition());
  }

  [Component.onDestroy]() {
    this.removeSpatialPartitionDependents(this.getCachedSpatialPartition());
  }

  public recacheSpatialPartition(spatialPartition: SpatialPartition<Collider>) {
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

    const colliderShape = <Shape>this.cache[LocalCacheKey.GPS];
    const clusterLevel = getShapeAppropriateClusterLevel(colliderShape);

    const clusters: SpatialPartitionCluster[] = this.entity.cache[LocalCacheKey.CBSPC] ?? [];
    delete this.entity.cache[LocalCacheKey.CBSPC];

    // TODO Delete only needed elements
    // delete clusters that the element occupais
    for (const boundCluster of clusters) {
      spatialPartition.modifyClusterElements(boundCluster, (elements) => elements.delete(this));
    }

    // TODO Merge with the above iteration
    const newBoundClusters = getBelongingClusters(colliderShape.bounds, clusterLevel);
    for (const boundCluster of newBoundClusters) {
      spatialPartition.injectBranch(boundCluster, [this]);
    }
    
    this.entity.cache[LocalCacheKey.CBSPC] = newBoundClusters;
  }

  [Component.onGizmosRender](gizmos: Gizmos) {
    for (const branch of <SpatialPartition<Collider>>this.entity.scene.cache[LocalCacheKey.CSP]) {
      const bounds = branch.cluster.getSpaceBounds();
      gizmos.highlightVertices(bounds.vertices, new Color(0, 0, 255, 0.1));
    }
  }

  public removeSpatialPartitionDependents(spatialPartition: SpatialPartition<Collider>) {
    const cache = this.entity.cache;
    const clusters: SpatialPartitionCluster[] = cache[LocalCacheKey.CBSPC] ?? [];
    delete cache[LocalCacheKey.CBSPC];

    // delete clusters that the element occupais
    for (const boundCluster of clusters) {
      spatialPartition.modifyClusterElements(boundCluster, (elements) => {
        elements.delete(this);
      });
    }
  }

  // public static 
  public static [Scene.onInstantiation](scene: Scene) {
    const spatialPartition = new SpatialPartition<Collider>(3);
    scene.cache[LocalCacheKey.CSP] = spatialPartition;

    const components = scene.getComponentsOfType(Collider);
    for (const meshRenderer of components) {
      meshRenderer.recacheSpatialPartition(spatialPartition);
    }
  }
}


export namespace Collider {
  export enum Behaviour {
    Dynamic,
    Trigger,
    Static,
  }

  export const CacheKey = LocalCacheKey;
}