import { SpatialPartitionCluster } from './spatial-partition-cluster';
import { Transformator } from 'objectra';

@Transformator.Register()
export class SpatialPartition<T> {
  private headBranch: SpatialPartition.ClusterBranch<T> | null = null;

  @Transformator.ArgumentPassthrough()
  public readonly clusterOpacity: number;

  constructor(clusterOpacity: number) {
    this.clusterOpacity = clusterOpacity;
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

  private getClusterBranch(cluster: SpatialPartitionCluster) {    
    if (!this.headBranch) {
      return this.createBranch(cluster);
    }

    // console.log(cluster.identifier, 'requested cluster get. This is the current head', Objectra.duplicate(this.headBranch))

    if (cluster.identifier === this.headBranch.cluster.identifier) {
      return this.headBranch;
    }

    if (cluster.level === this.headBranch.cluster.level) {
      return this.createBranch(cluster); // parallel branch which is not in the tree
    }

    // // console.log(this.headBranch.branches)

    if (cluster.level < this.headBranch.cluster.level) {
      if (this.clusterBelongsToCluster(cluster, this.headBranch.cluster)) {
        // sub of head
        // // console.log('1')
        const lookupPath = this.getClusterLookupPath(cluster, this.headBranch.cluster.level);
        const lookdownPath = [...lookupPath].reverse();

        let currentBranch = this.headBranch;
        for (const pathCluster of lookdownPath) {
          const nextBranch = currentBranch.branches[pathCluster.identifier];
          if (!nextBranch) {
            // // console.log()
            // console.log('create branch for', pathCluster.identifier, 'no sub bruch *');
            const branch = this.createBranch(pathCluster);
            currentBranch.branches[pathCluster.identifier] = branch;
          }
          currentBranch = currentBranch.branches[pathCluster.identifier];
        }

        // // console.log('>>', currentBranch)
        return currentBranch;
      }

      // // console.log('2');
      // console.log('CREATE branch for', cluster.identifier, 'not assigned to the head and lower level');
      return this.createBranch(cluster);
    }

    if (this.clusterBelongsToCluster(this.headBranch.cluster, cluster)) {
      // // console.log('3');
      // head is sub of provided cluster
      const lookupPath = this.getClusterLookupPath(this.headBranch.cluster, cluster.level);
      lookupPath.shift();
      const lookdownPath = [...lookupPath].reverse();

      const newHeadBranch = this.createBranch(cluster);
      let currentBranch = newHeadBranch;
      for (const pathCluster of lookdownPath) {
        // console.log('CREATE branch for', pathCluster.identifier, 'cluster is above head');
        const subBranch = this.createBranch(pathCluster);
        currentBranch.branches[subBranch.cluster.identifier] = subBranch;
        currentBranch = subBranch;
      }

      currentBranch.branches[this.headBranch.cluster.identifier] = this.headBranch;

      return newHeadBranch;
    }

    // // console.log('4');

    // console.log('CREATE branch for', cluster.identifier, 'cluster is below head but not parallel');
    return this.createBranch(cluster);
  }

  public getRelativlyHigherBranch(branch: SpatialPartition.ClusterBranch<T>, steps: number) {
    const targetLevel = branch.cluster.level + steps;
    return this.getClusterBranch(SpatialPartitionCluster.createFromPoint(branch.cluster.getSpacePosition(), targetLevel, this.clusterOpacity));
  }

  public injectBranchAndMerge(branchRelatedData: SpatialPartitionCluster | SpatialPartition.ClusterBranch<T>, elements: T[] = []) {
    // console.log('inject request');
    const injectableBranch = branchRelatedData instanceof SpatialPartitionCluster ? this.getClusterBranch(branchRelatedData) : branchRelatedData;
    const log = (s: SpatialPartition.ClusterBranch<T>) => `${s.cluster.identifier} => ${Object.values(s.branches).map(x => x.cluster.identifier).join(',')}`

    if (!this.headBranch) {
      this.headBranch = injectableBranch;
    }
    // console.log('injecting', injectableBranch.cluster.identifier)

    const minBranchLevel = Math.min(this.headBranch.cluster.level, injectableBranch.cluster.level);
    const overflowClusters = {
      targetCluster: [] as SpatialPartitionCluster[],
      headCluster: [] as SpatialPartitionCluster[],
    }


    const optionalLastElement = <T>(arr: T[], fallback: T) => arr[arr.length - 1] ?? fallback;

    let comparisonHeadCluster = optionalLastElement(overflowClusters.headCluster, this.headBranch.cluster); 
    let comparisonTargetCluster = optionalLastElement(overflowClusters.targetCluster, injectableBranch.cluster);

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

      if (currentLevel > 1000) {
        throw new Error('Overtop 1000');
      }

      comparisonHeadCluster = optionalLastElement(overflowClusters.headCluster, this.headBranch.cluster);
      comparisonTargetCluster = optionalLastElement(overflowClusters.targetCluster, injectableBranch.cluster);
    } // 2 clusters much identifiers

    for (const element of elements) {
      injectableBranch.elements.add(element);
    }

    if (overflowClusters.headCluster.length > 0 && overflowClusters.targetCluster.length > 0) { // Head and target will be extended to a common branch (higher from head)
      // console.log('head and target will be extended', log(this.headBranch))
      const topLevelOverflowCluster = overflowClusters.headCluster[overflowClusters.headCluster.length - 1];
      const newHeadBranch = this.getClusterBranch(topLevelOverflowCluster); // automatic merged with the head as its tree child
      // fill inter clusters between new head and the current head
      // console.log('got from up request (new future head)', Objectra.duplicate(newHeadBranch));
      
      let currentBranch = newHeadBranch;

      const targetOverflowLookdownPath = [...overflowClusters.targetCluster].reverse();
      targetOverflowLookdownPath.shift();

      for (const pathCluster of targetOverflowLookdownPath) {
        const branch = this.getClusterBranch(pathCluster);
        currentBranch = currentBranch.branches[pathCluster.identifier] = branch;
      }

      currentBranch.branches[injectableBranch.cluster.identifier] = injectableBranch;

      this.headBranch = newHeadBranch;

      // // console.log('END OF head and target will be extended', log(this.headBranch))
      return injectableBranch;
    } else if (overflowClusters.headCluster.length > 0) { // Head is injected to the target
      //injectableBranch
      // console.log('head will be injected to the target', log(this.headBranch))
      // // console.log('END OF head will be injected to the target', log(this.headBranch))
      this.headBranch = injectableBranch;
    } else if (overflowClusters.targetCluster.length > 0) { // Target is injected to the head
      // console.log('target will be injected to the head', log(this.headBranch))
      const targetOverflowLookdownPath = [...overflowClusters.targetCluster].reverse();
      targetOverflowLookdownPath.shift();

      let currentBranch = this.headBranch;
      for (const pathCluster of targetOverflowLookdownPath) {
        const branch = this.getClusterBranch(pathCluster);
        // console.log('branch', branch.cluster.identifier, 'has', Object.values(branch.branches).length, 'branches. set', pathCluster.identifier, 'to', currentBranch.cluster.identifier);
        currentBranch = currentBranch.branches[pathCluster.identifier] = branch;
      }

      // console.log('finally set', injectableBranch.cluster.identifier, 'to', currentBranch.cluster.identifier)
      currentBranch.branches[injectableBranch.cluster.identifier] = injectableBranch;
      // // console.log('END OF target will be injected to the head', log(this.headBranch))
    } else { // Target and head are the same branches
      // console.log('same branch, merging', log(this.headBranch));
      this.headBranch.branches = { ...this.headBranch.branches, ...injectableBranch.branches };
      // // console.log('END OF same branch, merging', log(this.headBranch));
    }
  }

  public modifyClusterElements(cluster: SpatialPartitionCluster, modifier: (elements: Set<T>) => void) {
    const branch = this.getClusterBranch(cluster);
    modifier(branch.elements);

    if (branch.elements.size === 0) {
      // console.log(cluster.identifier, 'is empty');
      this.ejectEmptyClusterTreeTrace(cluster);
    }
  }

  public ejectEmptyClusterTreeTrace(cluster: SpatialPartitionCluster) {
    if (!this.headBranch) {
      return false;
    }

    if (cluster.level > this.headBranch.cluster.level) {
      return false;
    }

    if (!this.clusterBelongsToCluster(cluster, this.headBranch.cluster)) {
      return false;
    }

    const providedClusterBranch = this.getClusterBranch(cluster);

    if (cluster.identifier === this.headBranch.cluster.identifier) {
      const subBranches = this.getRecursiveSubBranches(providedClusterBranch);
      const branchElementQuantity = subBranches.reduce((size, targetCluster) => size + targetCluster.elements.size, 0);
      if (branchElementQuantity > 0) {
        return false;
      }

      this.headBranch = null;
      return true;
    }

    let currentBranch = providedClusterBranch;
    const lookupPath = this.getClusterLookupPath(cluster, this.headBranch.cluster.level);
    lookupPath.shift();
    lookupPath.push(this.headBranch.cluster);
    for (const pathCluster of lookupPath) {
      const subBranches = this.getRecursiveSubBranches(currentBranch);
      const branchElementQuantity = subBranches.reduce((size, targetCluster) => size + targetCluster.elements.size, currentBranch.elements.size);
      if (branchElementQuantity > 0) {
        // console.log('more than 0 on', pathCluster.identifier)
        return false;
      }

      const parentBranch = this.getClusterBranch(pathCluster);
      delete parentBranch.branches[currentBranch.cluster.identifier];
      currentBranch = parentBranch;
    }

    // console.log(currentBranch.cluster.identifier, this.headBranch.cluster.identifier)

    if (currentBranch.cluster.identifier === this.headBranch.cluster.identifier) {      
      if (this.headBranch.elements.size === 0) {
        let newHeadBranch = this.headBranch;
        do {
          const subBranches = Object.values(newHeadBranch.branches);
          if (subBranches.length === 0) {
            this.headBranch = null;
            return;
          }

          if (subBranches.length > 1) {
            break;
          }
          
          // if lenght is 1
          newHeadBranch = subBranches[0];
        } while (true);

        this.headBranch = newHeadBranch;
      }
    }

    return true;
  }

  public [Symbol.iterator]() {
    const a = this.headBranch
    if (!this.headBranch) {
      return [].values();
    }

    let i = 0;

    const clusters: SpatialPartitionCluster[] = [];
    function extractCluster(branch: SpatialPartition.ClusterBranch<T>) {
      i++;

      if (i > 10000) {
        // // console.log(a);
        throw '';
      }

      clusters.push(branch.cluster);
      for (const subbranch of Object.values(branch.branches)) {
        extractCluster(subbranch);
      }
    }

    extractCluster(this.headBranch);
    return clusters.values();
  }

  /** Starts from the provided cluster level and ends one position before stop level */
  private getClusterLookupPath(cluster: SpatialPartitionCluster, stopLevel: number) {
    const lookupPath = [];
    for (let i = cluster.level; i < stopLevel; i++) {
      const leveledCluster = SpatialPartitionCluster.createFromPoint(cluster.getSpacePosition(), i, this.clusterOpacity);
      lookupPath.push(leveledCluster);
    }

    return lookupPath;
  }

  getRecursiveSubBranches(branch: SpatialPartition.ClusterBranch<T>) {
    const branches: SpatialPartition.ClusterBranch<T>[] = [branch];

    let i = 0;
    while(i !== branches.length) {
      const targetBranch = branches[i];
      branches.push(...Object.values(targetBranch.branches));
      i++;
    }

    return branches;
  }

  getInterLevelBranches(cluster: SpatialPartitionCluster) {
    if (!this.headBranch) {
      throw new Error('Not populated');
    }
    
    const branches: SpatialPartition.ClusterBranch<T>[] = [this.headBranch];
    
    const lookupPath = this.getClusterLookupPath(cluster, this.headBranch.cluster.level);

    let workBranch = this.headBranch;
    for (const lookupCluster of [...lookupPath].reverse()) {
      workBranch = workBranch.branches[lookupCluster.identifier];
      if (!workBranch) {
        return branches;
      }

      branches.push(workBranch);
    }

    const subBrunches: SpatialPartition.ClusterBranch<T>[] = [workBranch];
    let i = 0;
    while (i !== subBrunches.length) {
      const targetBranch = subBrunches[i];
      subBrunches.push(...Object.values(targetBranch.branches));
      i++;
    }

    subBrunches.shift();

    branches.push(...subBrunches);
    return branches;
  }
}

export namespace SpatialPartition {
  export interface ClusterBranch<T> {
    readonly cluster: SpatialPartitionCluster;
    elements: Set<T>;
    branches: { // using object with mapped identifiers for c++ speed (v8 transofrmation)
      [key: string]: ClusterBranch<T>;
    };
  }
}
