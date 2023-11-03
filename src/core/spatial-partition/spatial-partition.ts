import { everyArrayElementIsEqual } from 'objectra/dist/utils';
import { SpatialPartitionCluster } from './spatial-partition-cluster';
import { Transformator } from 'objectra';
import { Shape } from '../shape';
import { getBaseLog } from '../../utils';
import { Vector } from '../vector';

@Transformator.Register()
export class SpatialPartition<T> {
  private headBranch: SpatialPartition.ClusterBranch<T> | null = null;

  @Transformator.ConstructorArgument()
  public readonly clusterOpacity: number;

  constructor(clusterOpacity: number) {
    this.clusterOpacity = clusterOpacity;
  }

  public [Symbol.iterator]() {
    const subBranches = this.headBranch ? this.getFlattenSubBranches(this.headBranch) : [];
    return  subBranches.values();
  }

  public getFlattenSubBranches(branchRelatedData: SpatialPartitionCluster | SpatialPartition.ClusterBranch<T>) {
    const targetBranch = branchRelatedData instanceof SpatialPartitionCluster 
    ? this.getClusterBranch(branchRelatedData)
    : branchRelatedData;

    const flattenBranches = [targetBranch];

    let i = 0;
    while (i < flattenBranches.length) {
      const branch = flattenBranches[i];
      const subBranches = Object.values(branch.branches);
      flattenBranches.push(...subBranches);
      i++;
    }

    flattenBranches.unshift();

    return flattenBranches;
  }

  public getClusterBranch(cluster: SpatialPartitionCluster) {    
    if (!this.headBranch) {
      return this.createBranch(cluster);
    }

    if (cluster.identifier === this.headBranch.cluster.identifier) {
      return this.headBranch;
    }

    if (cluster.level === this.headBranch.cluster.level) {
      // Parallel branch to head (not in head tree)
      return this.createBranch(cluster);
    }

    if (cluster.level < this.headBranch.cluster.level) {
      if (!this.clusterBelongsToCluster(cluster, this.headBranch.cluster)) {
        return this.createBranch(cluster);
      }

      // Cluster is a nested sub branch of the head branch
      const lookupPath = this.getClusterLookupPath(cluster, this.headBranch.cluster.level);
      const lookdownPath = [...lookupPath].reverse();

      let currentBranch = this.headBranch;
      for (const pathCluster of lookdownPath) {
        const nextBranch = currentBranch.branches[pathCluster.identifier];
        if (!nextBranch) {
          return this.createBranch(cluster);
        }

        currentBranch = currentBranch.branches[pathCluster.identifier];
      }

      return currentBranch;
    }

    if (!this.clusterBelongsToCluster(this.headBranch.cluster, cluster)) {
      return this.createBranch(cluster);
    }

    // Head cluster is a nested sub branch of the provided cluster
    const lookupPath = this.getClusterLookupPath(this.headBranch.cluster, cluster.level);
    lookupPath.shift();
    const lookdownPath = [...lookupPath].reverse();

    const newHeadBranch = this.createBranch(cluster);
    let currentBranch = newHeadBranch;
    for (const pathCluster of lookdownPath) {
      const subBranch = this.createBranch(pathCluster);
      currentBranch = currentBranch.branches[subBranch.cluster.identifier] = subBranch;
    }

    currentBranch.branches[this.headBranch.cluster.identifier] = this.headBranch;
    return newHeadBranch;
  }

  public getRelativlyHigherBranch(branch: SpatialPartition.ClusterBranch<T>, steps: number) {
    const targetLevel = branch.cluster.level + steps;
    const leveledCluster = SpatialPartitionCluster.createFromPoint(branch.cluster.getSpacePosition(), targetLevel, this.clusterOpacity);
    return this.getClusterBranch(leveledCluster);
  }

  public getHeightTrace(cluster: SpatialPartitionCluster) {    
    if (!this.headBranch) {
      return [];
    }

    const branches: SpatialPartition.ClusterBranch<T>[] = [this.headBranch];
    
    const lookdownPath = this.getClusterLookupPath(cluster, this.headBranch.cluster.level).reverse();

    let workBranch = this.headBranch;
    for (const pathCluster of lookdownPath) {
      workBranch = workBranch.branches[pathCluster.identifier];
      if (!workBranch) {
        return branches;
      }

      branches.push(workBranch);
    }

    branches.push(...this.getFlattenSubBranches(workBranch));
    return branches;
  }

  public getClusterFromPoint(position: Vector, level = 1) {
    return SpatialPartitionCluster.createFromPoint(position, level, this.clusterOpacity);
  }

  public getBoundingBoxHeightTraceElements(shape: Shape) {
    const EPSILON_BIAS = 0.01;
  
    const boundingScale = shape.getScale();
    const maxScale = Math.max(boundingScale.x, boundingScale.y);
    const clusterLevel = Math.ceil(getBaseLog(this.clusterOpacity, maxScale + EPSILON_BIAS));

    const getBelongingClusters = (bounds: Shape, level: number) => {
      const belongingClusters = [];
      boundloop: for (let i = 0; i < bounds.vertices.length; i++) {
        const cluster = SpatialPartitionCluster.createFromPoint(bounds.vertices[i], level, this.clusterOpacity);
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

    const clusters = getBelongingClusters(shape.bounds, clusterLevel);

    const elements = new Set<T>();
    for (const cluster of clusters) {
      const branches = this.getHeightTrace(cluster);
      for (const element of branches.map(branch => [...branch.elements]).flat()) {
        elements.add(element);
      }
    }

    return elements;
  }


  public injectBranch(branchRelatedData: SpatialPartitionCluster | SpatialPartition.ClusterBranch<T>, elements: T[] = []) {
    const injectableBranch = branchRelatedData instanceof SpatialPartitionCluster 
    ? this.getClusterBranch(branchRelatedData) 
    : branchRelatedData;

    for (const element of elements) {
      injectableBranch.elements.add(element);
    }

    if (!this.headBranch) {
      return this.headBranch = injectableBranch;
    }

    const minBranchLevel = Math.min(this.headBranch.cluster.level, injectableBranch.cluster.level);
    const overflowClusters = {
      targetCluster: [] as SpatialPartitionCluster[],
      headCluster: [] as SpatialPartitionCluster[],
    }

    const optionalLastElement = <T>(arr: T[], fallback: T) => arr[arr.length - 1] ?? fallback;

    let comparisonHeadCluster = this.headBranch.cluster; 
    let comparisonTargetCluster = injectableBranch.cluster;

    let currentLevel = minBranchLevel;
    while (comparisonHeadCluster.identifier !== comparisonTargetCluster.identifier) {
      currentLevel++;
      
      if (comparisonHeadCluster.level < currentLevel) {
        const cluster = SpatialPartitionCluster.createFromPoint(comparisonHeadCluster.getSpacePosition(), currentLevel, this.clusterOpacity);
        overflowClusters.headCluster.push(cluster);
      }

      if (comparisonTargetCluster.level < currentLevel) {
        const cluster = SpatialPartitionCluster.createFromPoint(comparisonTargetCluster.getSpacePosition(), currentLevel, this.clusterOpacity);
        overflowClusters.targetCluster.push(cluster);
      }

      comparisonHeadCluster = optionalLastElement(overflowClusters.headCluster, this.headBranch.cluster);
      comparisonTargetCluster = optionalLastElement(overflowClusters.targetCluster, injectableBranch.cluster);
    }

    if (overflowClusters.headCluster.length > 0 && overflowClusters.targetCluster.length > 0) { 
      // Head cluster and target cluster will be extended to a common branch (higher from current head branch)
      const topLevelOverflowCluster = overflowClusters.headCluster[overflowClusters.headCluster.length - 1];
      const newHeadBranch = this.getClusterBranch(topLevelOverflowCluster); // automatic merged with the head as its tree child

      // Fill inter clusters between the new head branch and the target cluster
      const targetOverflowLookdownPath = [...overflowClusters.targetCluster].reverse();
      targetOverflowLookdownPath.shift();

      let currentBranch = newHeadBranch;
      for (const pathCluster of targetOverflowLookdownPath) {
        const branch = this.getClusterBranch(pathCluster);
        currentBranch = currentBranch.branches[pathCluster.identifier] = branch;
      }

      currentBranch.branches[injectableBranch.cluster.identifier] = injectableBranch;
      this.headBranch = newHeadBranch;
      return injectableBranch;
    } else if (overflowClusters.headCluster.length > 0) {
      // Head branch will be injected to the new target cluster branch
      // The `getClusterBranch` populate the branch with the head branch if it is below the requested branch
      this.headBranch = injectableBranch;
    } else if (overflowClusters.targetCluster.length > 0) {
      // Target cluster branch will be injected to the head branch
      const targetOverflowLookdownPath = [...overflowClusters.targetCluster].reverse();
      targetOverflowLookdownPath.shift();

      let currentBranch = this.headBranch;
      for (const pathCluster of targetOverflowLookdownPath) {
        const branch = this.getClusterBranch(pathCluster);
        currentBranch = currentBranch.branches[pathCluster.identifier] = branch;
      }

      currentBranch.branches[injectableBranch.cluster.identifier] = injectableBranch;
    } else { 
      // The cluster branch and the head branch are the same branch
      this.headBranch.branches = { ...this.headBranch.branches, ...injectableBranch.branches };
    }
  }

  public modifyClusterElements(cluster: SpatialPartitionCluster, mutator: (elements: Set<T>) => void) {
    const branch = this.getClusterBranch(cluster);
    mutator(branch.elements);

    if (branch.elements.size === 0) {
      this.ejectEmptyClusterTreeTrace(cluster);
    }
  }

  private createBranch(cluster: SpatialPartitionCluster, elements?: T[]): SpatialPartition.ClusterBranch<T> {
    return {
      cluster,
      elements: new Set<T>(elements),
      branches: {},
    }
  }

  private clusterBelongsToCluster(lowerCluster: SpatialPartitionCluster, higherCluster: SpatialPartitionCluster) {
    if (lowerCluster.level > higherCluster.level) {
      return false;
    }

    if (lowerCluster.level === higherCluster.level) {
      return lowerCluster.identifier === higherCluster.identifier;
    }

    const parallelClusterToHigherClusterLevel = SpatialPartitionCluster.createFromPoint(lowerCluster.getSpacePosition(), higherCluster.level, this.clusterOpacity);
    return parallelClusterToHigherClusterLevel.identifier === higherCluster.identifier;
  }

  private ejectEmptyClusterTreeTrace(cluster: SpatialPartitionCluster) {
    if (!this.headBranch) {
      return false;
    }

    if (cluster.level > this.headBranch.cluster.level) {
      return false;
    }

    if (!this.clusterBelongsToCluster(cluster, this.headBranch.cluster)) {
      return false;
    }

    const getFlattenBrancheElements = (branch: SpatialPartition.ClusterBranch<T>) => {
      const subBranches = this.getFlattenSubBranches(branch);
      const branchElementQuantity = subBranches.reduce((size, targetCluster) => size + targetCluster.elements.size, 0);
      return branchElementQuantity;
    }

    let currentBranch = this.getClusterBranch(cluster);
    if (cluster.identifier === this.headBranch.cluster.identifier) {
      const flattenBrancheElements = getFlattenBrancheElements(currentBranch);
      if (flattenBrancheElements > 0) {
        return false;
      }

      this.headBranch = null;
      return true;
    }

    const lookupPath = this.getClusterLookupPath(cluster, this.headBranch.cluster.level);
    lookupPath.shift();
    lookupPath.push(this.headBranch.cluster);

    for (const pathCluster of lookupPath) {
      const flattenBrancheElements = getFlattenBrancheElements(currentBranch);
      if (flattenBrancheElements > 0) {
        return false;
      }

      const parentBranch = this.getClusterBranch(pathCluster);
      delete parentBranch.branches[currentBranch.cluster.identifier];
      currentBranch = parentBranch;
    }


    delete this.headBranch.branches[currentBranch.cluster.identifier];

    if (currentBranch.cluster.identifier !== this.headBranch.cluster.identifier) {
      return true;
    }

    if (this.headBranch.elements.size > 0) {
      return true;
    }

    let newHeadBranch = this.headBranch;
    let subBranches = Object.values(newHeadBranch.branches);
    while (subBranches.length === 0 || subBranches.length === 1) {
      if (newHeadBranch.elements.size > 0) {
        break;
      }

      if (subBranches.length === 0) {
        this.headBranch = null;
        return true;
      }

      newHeadBranch = subBranches[0];
      subBranches = Object.values(newHeadBranch.branches);
    }

    this.headBranch = newHeadBranch;
    return true;
  }

  private getClusterLookupPath(cluster: SpatialPartitionCluster, stopLevel: number) {
    const lookupPath = [];
    for (let i = cluster.level; i < stopLevel; i++) {
      const leveledCluster = SpatialPartitionCluster.createFromPoint(cluster.getSpacePosition(), i, this.clusterOpacity);
      lookupPath.push(leveledCluster);
    }

    return lookupPath;
  }

  public *rayTraceClusters(startVector: Vector, endVector: Vector, level = 0): Generator<SpatialPartitionCluster, void, void> {
    const operator = 1 / SpatialPartitionCluster.getFirstLevelClusterQuantity(level, this.clusterOpacity);
    const gridOffsetBias = 0.5;

    const start = startVector.multiply(operator).add(gridOffsetBias);
    const end = endVector.multiply(operator).add(gridOffsetBias);

    let [ x, y ] = Vector.floor(start).raw;
    const difference = end.subtract(start);
    const step = Vector.sign(difference);
    
    //Straight distance to the first vertical grid boundary.
    const xOffset = (
      end.x > start.x
      ? (Math.ceil(start.x) - start.x)
      : (start.x - Math.floor(start.x))
    );

    //Straight distance to the first horizontal grid boundary.
    const yOffset = (
      end.y > start.y
      ? (Math.ceil(start.y) - start.y) 
      : (start.y - Math.floor(start.y))
    );

    const angle = Math.atan2(-difference.y, difference.x);

    // Divide by 0 === Infinity

    //How far to move along the ray to move horizontally 1 grid cell.
    const tDeltaX = 1 / Math.cos(angle);
    
    //How far to move along the ray to move vertically 1 grid cell.
    const tDeltaY = 1 / Math.sin(angle);
  
    //How far to move along the ray to cross the first vertical grid cell boundary.
    let tMaxX = xOffset / Math.cos(angle);

    //How far to move along the ray to cross the first horizontal grid cell boundary.
    let tMaxY = yOffset / Math.sin(angle);
    
    //Travel one grid cell at a time.
    const manhattanDistance = (
      Math.abs(Math.floor(end.x) - Math.floor(start.x)) +
      Math.abs(Math.floor(end.y) - Math.floor(start.y))
    );

    for (let t = 0; t <= manhattanDistance; t++) {
      const gridCell = new Vector(x, y).divide(operator);
      yield this.getClusterFromPoint(gridCell, level);

      //Only move in either X or Y coordinates, not both.
      if (Math.abs(tMaxX) < Math.abs(tMaxY)) {
        tMaxX += tDeltaX;
        x += step.x;
      } else {
        tMaxY += tDeltaY;
        y += step.y;
      }
    }
  }
}

export namespace SpatialPartition {
  export interface ClusterBranch<T> {
    readonly cluster: SpatialPartitionCluster;
    elements: Set<T>;
    branches: { 
      // Use object with mapped identifiers for c++ speed after optimization
      [key: string]: ClusterBranch<T>;
    };
  }
}
