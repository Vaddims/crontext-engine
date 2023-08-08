import { Transformator } from "objectra";
import { Shape } from "../shape";
import { Vector } from "../vector";

@Transformator.Register()
export class SpatialPartitionCluster {
  readonly identifier: string;

  @Transformator.ArgumentPassthrough(0)
  readonly level: number;
  
  @Transformator.ArgumentPassthrough(1)
  readonly clusterOpacity: number;

  @Transformator.ArgumentPassthrough(2)
  readonly position: Vector;

  constructor(level: number, clusterOpacity: number, position: Vector) {
    this.identifier = `C${level}/${position.x}:${position.y}`;
    this.position = position;
    this.level = level;
    this.clusterOpacity = clusterOpacity;
  }

  public getSpacePosition() {
    return this.position.multiply(SpatialPartitionCluster.getFirstLevelClusterQuantity(this.level, this.clusterOpacity));
  }

  public getSpaceBounds() {
    const firstLevelClusterQuantity = SpatialPartitionCluster.getFirstLevelClusterQuantity(this.level, this.clusterOpacity); 
    return new Shape([
      new Vector(-0.5, 0.5),
      new Vector(0.5, 0.5),
      new Vector(0.5, -0.5),
      new Vector(-0.5, -0.5),
    ]).withScale(firstLevelClusterQuantity).withOffset(this.getSpacePosition());
  }

  public static getFirstLevelClusterQuantity(level: number, clusterOpacity: number) {
    return clusterOpacity ** level;
  }

  public static getLevelPositionFromPoint(position: Vector, level: number, clusterOpacity: number) {
    const firstLevelClusterQuantity = SpatialPartitionCluster.getFirstLevelClusterQuantity(level, clusterOpacity);
    return Vector.round(position.divide(firstLevelClusterQuantity));
  }

  public static createFromPoint(position: Vector, level: number, clusterOpacity: number) {
    const realativePosition = SpatialPartitionCluster.getLevelPositionFromPoint(position, level, clusterOpacity);
    return new SpatialPartitionCluster(level, clusterOpacity, realativePosition);
  }

  public isSubclusterOf(cluster: SpatialPartitionCluster, clusterOpacity: number) {
    if (cluster.identifier === this.identifier) {
      return false;
    }

    if (cluster.level < this.level) {
      return false;
    }

    if (cluster.level === this.level) {
      return false;
    }

    const sameLevelCluster = SpatialPartitionCluster.createFromPoint(this.getSpacePosition(), cluster.level, clusterOpacity);
    return sameLevelCluster.identifier === cluster.identifier;
  }
}