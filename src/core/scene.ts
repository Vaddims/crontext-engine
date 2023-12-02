import { Component, ComponentConstructor } from "./component";
import { Entity } from "./entity";
import { Objectra, Transformator, transformators } from 'objectra';
import { pushElementToMapValue } from "../utils/buildin-helpers";
import { type MeshRenderer, type Camera } from "../components";
import { Shape } from "./shape";
import { SpatialPartitionCluster } from "./spatial-partition/spatial-partition-cluster";
import { SpatialPartition } from "./spatial-partition/spatial-partition";
import { getBaseLog } from "../utils";
import { Constructor } from "objectra/dist/types/util.types";
import { EntityTransform } from "./entity-transform";

@Transformator.Register<Scene>()
export class Scene implements Iterable<Entity> {
  public name = 'Scene';

  private readonly hoistedEntities = new Set<Entity>();
  private readonly entityInstances = new Set<Entity>();

  private readonly componentInstances = new Set<Component>();
  
  @Transformator.Exclude()
  private readonly signals: Signal[] = [];
  @Transformator.Exclude()
  private readonly signalResult = new WeakMap<Signal, unknown>();
  @Transformator.Exclude()
  private readonly signalResultCallbacks = new WeakMap<Signal, Function[]>();

  @Transformator.Exclude()
  public readonly meshRendererSpatialPartition = new SpatialPartition<MeshRenderer>(3);

  // TODO Add all edge cases
  public recacheEntitySpatialPartition(entity: Entity) {
    const mr = [...entity.components].find(component => component.constructor.name === 'MeshRenderer') as MeshRenderer | undefined;
    if (mr) {
      this.recacheMeshRendererSpatialPartition(mr);
    }
  }

  public recacheMeshRendererSpatialPartition(meshRenderer: MeshRenderer) {
    const getShapeAppropriateClusterLevel = (shape: Shape) => {
      const epsilonBias = 0.01;
      const boundsScale = shape.bounds.getScale();
      const maxScale = Math.max(boundsScale.x, boundsScale.y);
      const clusterLevel = Math.ceil(getBaseLog(this.meshRendererSpatialPartition.clusterOpacity, maxScale + epsilonBias));
      return clusterLevel;
    }

    const getBelongingClusters = (bounds: Shape, level: number) => {
      const belongingClusters = [];
      boundloop: for (let i = 0; i < bounds.vertices.length; i++) {
        const cluster = SpatialPartitionCluster.createFromPoint(bounds.vertices[i], level, this.meshRendererSpatialPartition.clusterOpacity);
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

    const meshRendererShape = new Shape(meshRenderer.relativeVerticesPosition());
    const clusterLevel = getShapeAppropriateClusterLevel(meshRendererShape);

    const entitySPCCache = meshRenderer.entity.establishCacheConnection<SpatialPartitionCluster[] | null>('spc');
    const cachedBoundClusters = entitySPCCache.get();
    const boundClusters = cachedBoundClusters ? [...cachedBoundClusters] : null;
    entitySPCCache.set([]); // delete cache

    // delete clusters that the element occupais
    if (boundClusters) {
      for (const boundCluster of boundClusters) {
        this.meshRendererSpatialPartition.modifyClusterElements(boundCluster, (elements) => {
          elements.delete(meshRenderer);
        });
      }
    }

    const newBoundClusters = getBelongingClusters(meshRendererShape.bounds, clusterLevel);

    for (const boundCluster of newBoundClusters) {
      this.meshRendererSpatialPartition.injectBranch(boundCluster, [meshRenderer]);
    }
    
    entitySPCCache.modify((existingClusters => (
      existingClusters ? existingClusters.concat(...newBoundClusters) : [...newBoundClusters]
    )));
  }

  public removeEntitySpatialPartion(meshRenderer: MeshRenderer) {
    const entitySPCCache = meshRenderer.entity.establishCacheConnection<SpatialPartitionCluster[] | null>('spc');
    const cachedBoundClusters = entitySPCCache.get();
    const boundClusters = cachedBoundClusters ? [...cachedBoundClusters] : null;
    entitySPCCache.set([]); // delete cache

    // delete clusters that the element occupais
    if (boundClusters) {
      for (const boundCluster of boundClusters) {
        this.meshRendererSpatialPartition.modifyClusterElements(boundCluster, (elements) => {
          elements.delete(meshRenderer);
        });
      }
    }
  }

  public recacheSpatialPartition() {
    console.log('recache spatial partion')
    const components = this.getComponents();
    const meshRenderers = components.filter(component => component.constructor.name === 'MeshRenderer') as MeshRenderer[];
    this.meshRendererSpatialPartition['headBranch'] = null;
    for (const meshRenderer of meshRenderers) {
      this.recacheMeshRendererSpatialPartition(meshRenderer);
    }
  }

  public [Symbol.iterator]() {
    return this.entityInstances.values();
  }

  public getHoistedEntities() {
    return [...this.hoistedEntities];
  }

  public getEntities() {
    return [...this];
  }

  public getCameras() {
    return this.getComponents().filter(component => component.constructor.name === 'Camera') as Camera[];
  }

  public find(name: string) {
    return this.getEntities().find(entity => entity.name === name);
  }

  public getComponents() {
    const components: Component[] = [];
    function parseEntity(entity: Entity) {
      for (const component of entity.components) {
        components.push(component);
      }

      const children = entity.getChildren();
      for (const child of children) {
        parseEntity(child);
      }
    }

    for (const child of this.hoistedEntities) {
      parseEntity(child);
    }
    
    return components;
  }

  public getComponentsOfType<T extends Component>(type: Constructor<T> | string) {
    const components = this.getComponents();
    const targets: T[] = [];

    const classExpression = (component: Component, classConstructor: Constructor<T>) => component instanceof classConstructor;
    const stringExpression = (component: Component, className: string) => component.constructor.name === className;
    const executionExpression = typeof type === 'string' ? stringExpression : classExpression;
    // Use this for performance

    for (const component of components) {
      if (executionExpression(component, type as any)) {
        targets.push(component as T);
      }
    }
    
    return targets;
  }

  private addSignal(signal: Signal) {
    this.signals.push(signal);

  }
  
  public requestEntityInstantiation(entity?: Entity): Signal.EntityInstantiation {
    const entityInstantiationRequest: any = {
      type: Signal.Type.EntityInstantiation,
      origin: entity,
    } as const;

    this.addSignal(entityInstantiationRequest);
    return entityInstantiationRequest;
  }

  public requestEntityTransformation(entity: Entity, parent?: Entity | null): Signal.EntityTransformation {
    const entityTransformationRequest = {
      type: Signal.Type.EntityTransformation,
      entity,
      parent,
    } as const;

    this.addSignal(entityTransformationRequest);
    return entityTransformationRequest;
  }

  public requestEntityDestruction(entity: Entity): Signal.EntityDestruction {
    const entityDestructionRequest = {
      type: Signal.Type.EntityDestruction,
      entity,
    } as const;

    this.addSignal(entityDestructionRequest);
    return entityDestructionRequest;
  }

  public requestComponentSignalEmission<Args extends any[], Return>(
   symbol: symbol, options?: Signal.SignalEmission.Options<Args, Return>
  ): Signal.SignalEmission<Args, Return> {
    const {
      args = [],
      target = Signal.Emission.ExecutionLevel.Broadcast,
      initiator,
    } = options ?? {};

    const scene = this;
    const signalEmissionRequest: Signal.SignalEmission<Args, Return> = {
      type: Signal.Type.SignalEmission,
      symbol,
      args: args as any,
      target,
      initiator,
      onResolution: function (cb) {
        const arr = scene.signalResultCallbacks.get(this);
        if (!arr) {
          scene.signalResultCallbacks.set(this, [cb]);
        } else {
          arr.push(cb);
        }

        return this;
      }
    };

    this.addSignal(signalEmissionRequest);
    return signalEmissionRequest;
  }

  public requestComponentInstantiation<T extends ComponentConstructor>(componentConstructor: T, entity: Entity) {
    const componentInstantiationRequest: Signal.ComponentInstantiation<T> = {
      type: Signal.Type.ComponentInstantiation,
      componentConstructor,
      entity,
    };

    this.addSignal(componentInstantiationRequest);
    return componentInstantiationRequest;
  }

  public requestComponentDestruction<T extends ComponentConstructor>(componentConstructor: T, entity: Entity) {
    const componentDestructionRequest: Signal.ComponentDestruction<T> = {
      type: Signal.Type.ComponentDestruction,
      componentConstructor,
      entity,
    }
    
    this.addSignal(componentDestructionRequest)
    return componentDestructionRequest;
  }

  public instantEntityInstantiation(entity: Entity): Entity | undefined {
    const instantiationRequest = this.requestEntityInstantiation(entity);
    this.update();
    return this.signalResult.get(instantiationRequest) as any;
  }

  public instantResolve<T extends Signal>(signal: T) {
    this.update();

    if (!this.signalResult.has(signal)) {
      throw new Error('No action request match for instant resolve');
    }

    return this.signalResult.get(signal) as Signal.Response<T>;
  }

  private resolveEntityInstantitationSignal(instantiationSignal: Signal.EntityInstantiation) {
    const { origin } = instantiationSignal;
    const entity = origin ? Objectra.duplicate(origin) : new Entity();
    this.entityInstances.add(entity);
    this.hoistedEntities.add(entity);
    entity['parentScene'] = this;
    return entity;
  }

  private resolveEntityTransformationSignal(transformationSignal: Signal.EntityTransformation) {
    const { entity, parent: newParent = null } = transformationSignal;

    if (entity.parent === newParent) {
      return;
    }

    if (!this.entityInstances.has(entity)) {
      throw new Error('Could not transfer an uninstantiated entity');
    }

    if (newParent && !this.entityInstances.has(newParent)) {
      throw new Error('Could not transfer the entity to an uninstantiated parent');
    }

    if (entity === newParent) {
      throw new Error('Could not transfer the entity to itself');
    }

    if (newParent) {
      newParent['children'].add(entity);
      if (entity.parent === null) {
        this.hoistedEntities.delete(entity);
      }
    } else {
      this.hoistedEntities.add(entity);
    }

    entity.parent?.['children'].delete(entity);

    const pureEntityTransform = entity.transform.toPureTransform();

    const previousParent = entity['parentEntity'];
    entity['parentEntity'] = newParent;
    if (newParent && !previousParent) {
      entity.transform.calibrateLocals();
    } else {
      entity.transform.calibrateGlobals(pureEntityTransform);
    }

    return entity;
  }

  private resolveEntityDestructionSignal(destructionSignal: Signal.EntityDestruction) {
    const { entity } = destructionSignal;

    const entityExisted = this.entityInstances.delete(entity);
    if (!entityExisted) {
      return false;
    }

    if (!entity.parent) {
      this.hoistedEntities.delete(entity);
    }

    for (const component of entity.components) {
      this.componentInstances.delete(component);
    }

    entity.parent?.['children'].delete(entity);
    entity['parentScene'] = null;
    entity['parentEntity'] = null;

    // for (const children of entity.getFlattenChildren()) {
    //   this.entityInstances.delete(children);
    // }

    for (const children of entity.getChildren()) {
      this.requestEntityDestruction(children);
    }

    return true;
  }

  private resolveComponentInstantiationSignal(componentInstantiationRequest: Signal.ComponentInstantiation) {
    const { componentConstructor, entity } = componentInstantiationRequest;
    const baseConstructor = Component.getBaseclassOf(componentConstructor);
    if (entity.components.findOfType(baseConstructor)) {
      throw new Error(`Component of class ${baseConstructor.name} already exists`);
    }

    const componentInstance = new componentConstructor(entity);
    this.componentInstances.add(componentInstance);
    entity.components['hoistingComponents'].set(baseConstructor, componentInstance);

    return componentInstance;
  }

  private resolveComponentDestructionSignal(componentDestructionRequest: Signal.ComponentDestruction): Component | null {
    const { componentConstructor, entity } = componentDestructionRequest;

    const baseClassOfConstructor = Component.getBaseclassOf(componentConstructor)
    const componentInstance = entity.components['hoistingComponents'].get(baseClassOfConstructor);
    if (!componentInstance) {
      return null;
    }

    this.componentInstances.delete(componentInstance);
    entity.components['hoistingComponents'].delete(baseClassOfConstructor);
    
    return componentInstance;
  }

  private resolvePrimitiveSignal(signal: Signal) {
    const { Type } = Signal;
    const { type } = signal;

    type Resolution = ReturnType<
      | typeof this.resolveEntityInstantitationSignal
      | typeof this.resolveEntityTransformationSignal
      | typeof this.resolveEntityDestructionSignal
      | typeof this.resolveComponentInstantiationSignal
      | typeof this.resolveComponentDestructionSignal
    >

    let resolution: Resolution;

    switch(type) {
      case Type.EntityInstantiation:
        resolution = this.resolveEntityInstantitationSignal(signal);
        break;
      
      case Type.EntityTransformation:
        resolution = this.resolveEntityTransformationSignal(signal);
        break;
        
        case Type.EntityDestruction:
          const mrInstance = [...signal.entity.components].find(c => c.constructor.name === 'MeshRenderer');
          if (mrInstance) {
            this.removeEntitySpatialPartion(mrInstance as MeshRenderer);
          }

          resolution = this.resolveEntityDestructionSignal(signal);
        break;

      case Type.ComponentInstantiation:
        resolution = this.resolveComponentInstantiationSignal(signal);
        break;

      case Type.ComponentDestruction:
        if (signal.componentConstructor.name === 'MeshRenderer') {
          const component = signal.entity.components.get(signal.componentConstructor);
          if (component) {
            this.removeEntitySpatialPartion(component as MeshRenderer);
          }
        }

        resolution = this.resolveComponentDestructionSignal(signal) as Component | null;
        break;
    }

    // switch(Signal.type) {
    //   case Types.EntityInstantiation:
    //   case Types.EntityTransformation:
    //   case Types.ComponentInstantiation:
    //     if (resolution instanceof Entity) {
    //       this.recacheEntitySpatialPartition(resolution);
    //     }

    //     if (resolution instanceof Component) {
    //       this.recacheEntitySpatialPartition(resolution.entity);
    //       break;
    //     }
    //     break;
    // }

    return resolution;
  }

  private resolveSignals() {
    if (this.signals.length === 0) {
      return;
    }

    type AnyGenerator = Component.ActionMethods.Sequential.Generator.Any;
    const self = this;

    const generatorMethodComponentMap = new Map<AnyGenerator, [Component.ActionMethod.Any, Component]>();
    const generatorParentMap = new Map<AnyGenerator, AnyGenerator>();
    const generatorEmissionRequest = new Map<AnyGenerator, Signal.SignalEmission>();
    const generatorSignalHistoryMap = new Map<AnyGenerator, Signal[]>();

    const signalEmissionFinishQuantity = new Map<Signal.SignalEmission, number>();
    
    const signalEmissionGeneratorMap = new Map<Signal.SignalEmission, AnyGenerator[]>();
    const signalResultMap = new Map<Signal, any>(); // Results for each requested action request
    const signalEmissionResponses = new Map<Signal.SignalEmission, Signal.Emission.SegmentResponse[]>();

    const addSignalResultSegment = (Signal: Signal.SignalEmission, emissionExecutionResult: Signal.Emission.SegmentResponse) => {
      pushElementToMapValue(signalEmissionResponses, Signal, emissionExecutionResult);

      const responses = signalEmissionResponses.get(Signal)!;
      const awaitingResponses = signalEmissionFinishQuantity.get(Signal);
      if (responses.length === awaitingResponses) {
        signalResultMap.set(Signal, responses)
      }
    }

    const currentGeneratorExecutions = new Set<AnyGenerator>(); // Executions that are currently resolving

    let updateQuantity = 0;
    const MAX_UPDATE_QUANTITY = 100000;
    useSignalHopperResolve();

    do {
      if (updateQuantity++ > MAX_UPDATE_QUANTITY) {
        throw new Error('Update limit exceeded');
      }

      // Update all existing action requests
      // Use array.from to prevent the loop from behaving unexpectly because of `currentGeneratorExecutions` mutations

      for (const executionGenerator of Array.from(currentGeneratorExecutions)) {
        // resolveGeneratorIteration(executionGenerator);
        const result = resolveGeneratorIteration(executionGenerator);

        // Resolve all added action requests
        useSignalHopperResolve();

        // If done, unroll the generator to its parent
        handleItarationResult(executionGenerator, result);
      }

      // Forced update loop
    } while (currentGeneratorExecutions.size > 0);

    for (const [signal, result] of signalResultMap) {
      this.signalResult.set(signal, result);

      if (signal.type === Signal.Type.SignalEmission) {
        const arr = this.signalResultCallbacks.get(signal);
        arr?.forEach(cb => cb());
      }
    }

    // if (updateQuantity > 0) {
    //   this.recacheSpatialPartition();
    // }

    function resolveGeneratorIteration(generator: AnyGenerator) {
      const generatorSignalHistory = generatorSignalHistoryMap.get(generator) ?? [];
      const lastSignal = generatorSignalHistory[generatorSignalHistory.length - 1];

      let responseArguments;

      if (lastSignal) {
        if (signalResultMap.has(lastSignal)) {
          responseArguments = signalResultMap.get(lastSignal);
        } else if (lastSignal?.type === Signal.Type.SignalEmission) {
          const actionResponse = signalEmissionResponses.get(lastSignal) ?? [];
          responseArguments = [...actionResponse];
        }
      }

      const yieldRequest = generator.next(responseArguments);
      return yieldRequest;
    }

    function handleItarationResult(generator: AnyGenerator, iteratorResult: IteratorResult<Component.ActionMethods.Sequential.YieldRequest, any>) {
      const generatorParent = generatorParentMap.get(generator);

      if (iteratorResult.done) {
        const Signal = generatorEmissionRequest.get(generator) as Signal.SignalEmission;
        const methodComponent = generatorMethodComponentMap.get(generator);

        if (!methodComponent) {
          throw new Error('Method and component not found for generator');
        }

        const [ method, component ] = methodComponent;

        const emissionExecutionResult: Signal.Emission.SegmentResponse = { 
          result: iteratorResult.value,
          component,
          method,
        };

        addSignalResultSegment(Signal, emissionExecutionResult)
        currentGeneratorExecutions.delete(generator)

        if (!generatorParent) {
          return;
        }
  
        const allChildrenExecutionsResolved = Array.from(currentGeneratorExecutions).every(execution => generatorParentMap.get(execution) !== generatorParent);
  
        if (!allChildrenExecutionsResolved) {
          return;
        }
  
        currentGeneratorExecutions.add(generatorParent);
        return;
      }

      const { value: yieldSignal } = iteratorResult;
      if (!yieldSignal) {
        return;
      }

      if (Symbol.iterator in yieldSignal) {
        throw new Error('Not implemented');
      }

      pushElementToMapValue(generatorSignalHistoryMap, generator, yieldSignal);

      if (yieldSignal.type !== Signal.Type.SignalEmission) {
        return;
      }

      const yieldedSignalEmissionGenerators = signalEmissionGeneratorMap.get(yieldSignal);

      if (!yieldedSignalEmissionGenerators) {
        return;
      }

      for (const yieldedSignalEmissionGenerator of yieldedSignalEmissionGenerators) {
        generatorParentMap.set(yieldedSignalEmissionGenerator, generator);
      }

      currentGeneratorExecutions.delete(generator);
    }

    function initializeComponentRequestMethod(
      SignalEmissionRequest: Signal.SignalEmission, 
      receiver: Component.ImplicitActionMethodWrapper
    ): Signal.Emission.MethodInitialization | void {
      const { symbol, args } = SignalEmissionRequest;
      const eventMethod = receiver[symbol]?.bind(receiver);
      if (!eventMethod) {
        return;
      }
  
      if (!Component.eventMethodIsSequential(eventMethod)) {
        const result = eventMethod(...args) as AnyGenerator;
        return { method: eventMethod, result, component: receiver };
      }
  
      const generator = eventMethod(...args);
      generatorMethodComponentMap.set(generator, [eventMethod, receiver]);
      pushElementToMapValue(signalEmissionGeneratorMap, SignalEmissionRequest, generator);

      return { method: eventMethod, generator, component: receiver };
    }

    function initializeEmissionRequest(SignalEmissionRequest: Signal.SignalEmission) {
      const { ExecutionLevel } = Signal.Emission;

      const { 
        initiator,
        target = ExecutionLevel.EntityBroadcast,
      } = SignalEmissionRequest;

      const resolve = (receivers: Component[]) => {
        signalEmissionFinishQuantity.set(SignalEmissionRequest, receivers.length);

        return (receivers as Component.ImplicitActionMethodWrapper[])
          .map((component) => initializeComponentRequestMethod(SignalEmissionRequest, component))
          .filter(Boolean) as Signal.Emission.MethodInitialization[];
      }

      if (Array.isArray(target)) {
        return resolve(target);
      }

      switch (target) {
        case ExecutionLevel.Broadcast:
          return resolve(self.getComponents());
        
        case ExecutionLevel.EntityBroadcast:
          if (!initiator) {
            throw new Error('Cannot broadcast emission to entity without initiator');
          }

          return resolve([...initiator.entity.components.instances()]);

        case ExecutionLevel.EntityDeepBroadcast:
          if (!initiator) {
            throw new Error('Cannot broadcast emission to entity without initiator');
          }

          const entities = initiator.entity.getFlattenChildren()
          const components = entities.map(entity => [...entity.components]).flat();
          return resolve(components);
      }
    }

    function resolveSignalEmissionStage(emissionRequest: Signal.SignalEmission) {
      const methodInitializationResults = initializeEmissionRequest(emissionRequest);

      for (const methodInitializationResult of methodInitializationResults) {
        if (!methodInitializationResult) {
          continue;
        }

        // Primitive method
        if ('result' in methodInitializationResult) {
          const response: Signal.Emission.SegmentResponse<any> = { 
            result: methodInitializationResult.result,
            component: methodInitializationResult.component,
            method: methodInitializationResult.method,  
          };

          addSignalResultSegment(emissionRequest, response)
          continue;
        }

        // Complex method, should compute in next interim updates
        const { generator } = methodInitializationResult;
        generatorEmissionRequest.set(generator, emissionRequest);
        currentGeneratorExecutions.add(generator)
      }
    }

    function useSignalHopperResolve() {
      do {
        const emissionRequests: Signal.SignalEmission[] = [];
        // First resolve all primitive action requests
        for (const signal of self.signals) {
          if (signal.type === Signal.Type.SignalEmission) {
            emissionRequests.push(signal);
            continue;
          }
  
          // NO REQUESTS FROM PRIMITIVE ACTION REQUERSTS
          const result = signalResultMap.has(signal) 
            ? signalResultMap.get(signal) 
            : self.resolvePrimitiveSignal(signal);

          signalResultMap.set(signal, result);
        }

        self.signals.length = 0;
  
        for (const emissionRequest of emissionRequests) {
          resolveSignalEmissionStage(emissionRequest);
        }

        // Action request hopper like loop
      } while (self.signals.length > 0);
    }
  }

  public start() {
    // this.recacheSpatialPartition();
  }

  public update() {
    this.resolveSignals();
  }
}

export type Signal = (
  | Signal.EntityInstantiation
  | Signal.EntityTransformation
  | Signal.EntityDestruction
  | Signal.ComponentInstantiation
  | Signal.ComponentDestruction
  | Signal.SignalEmission<any, any>
);

export namespace Signal {
  export type FromType<T extends Signal.Type> = Omit<Signal & { type: T }, 'type'>;

  export enum Type {
    EntityInstantiation,
    EntityDestruction,
    EntityTransformation,
    ComponentInstantiation,
    ComponentDestruction,
    SignalEmission,
  }

  export interface Base<T extends Type> {
    readonly type: T;
  }

  export type SignalCollection = Signal[] | readonly Signal[];

  export type ValidRequestFormat = Signal | SignalCollection | undefined;
  export type Response<T extends ValidRequestFormat> = (
    T extends SignalCollection ? SignalCollectionResponse<T> :
    T extends Signal ? SignalResponse<T> : 
    T
  );

  type SignalResponse<T extends Signal> = (
    T extends Signal.EntityInstantiation ? Entity : 
    T extends Signal.EntityTransformation ? boolean :
    T extends Signal.EntityDestruction ? boolean :
    T extends Signal.ComponentInstantiation ? Component :
    T extends Signal.ComponentDestruction ? boolean :
    T extends Signal.SignalEmission<any, infer U> 
      ? Signal.Emission.ClusterResponse<U> :
    never
  );

  type SignalCollectionResponse<T extends SignalCollection> = { 
    [K in keyof T]: Response<T[K] & Signal>
  }

  export namespace Emission {
    export namespace MethodInitializations {
      interface BaseResponse {
        readonly component: Component;
        readonly method: Component.ActionMethods.Instantaneous;
      }

      export interface InstantaneousResponse extends BaseResponse {
        readonly result: unknown;
      } 
      
      export interface SequentialResponse extends BaseResponse {
        readonly generator: Generator<Component.ActionMethods.Sequential.YieldRequest, unknown, unknown>;
      }
    }
    
    export type MethodInitialization = MethodInitializations.InstantaneousResponse | MethodInitializations.SequentialResponse;

    export interface SegmentResponse<T = any> {
      readonly component: Component;
      readonly method: Component.ActionMethod;
      readonly result: T;
    }

    export type ClusterResponse<T = any> = SegmentResponse<T>[];

    export enum ExecutionLevel {
      Broadcast,
      EntityBroadcast,
      EntityDeepBroadcast,
    }
  }

  export interface EntityInstantiation extends Signal.Base<Signal.Type.EntityInstantiation> {
    readonly origin?: Entity;
  }

  export interface EntityDestruction extends Signal.Base<Signal.Type.EntityDestruction> {
    readonly entity: Entity;
  }

  export interface EntityTransformation extends Signal.Base<Signal.Type.EntityTransformation> {
    readonly entity: Entity;
    readonly parent?: Entity | null | undefined;
  }

  export interface ComponentInstantiation<T extends ComponentConstructor = ComponentConstructor> extends Signal.Base<Signal.Type.ComponentInstantiation> {
    readonly componentConstructor: T;
    readonly entity: Entity;
  }

  export interface ComponentDestruction<T extends ComponentConstructor = ComponentConstructor> extends Signal.Base<Signal.Type.ComponentDestruction> {
    readonly componentConstructor: T;
    readonly entity: Entity;
  }

  export interface SignalEmission<
    Args extends unknown[] = unknown[], _Return = unknown
  > extends Signal.Base<Signal.Type.SignalEmission> {
    readonly initiator?: Component | EntityTransform | undefined;
    readonly symbol: symbol;
    readonly args: Args;
    readonly target?: Emission.ExecutionLevel | Component[];
    readonly onResolution: (cb: () => void) => this;
  }

  export namespace SignalEmission {
    export interface Options<Args extends unknown[] = unknown[], _Return = unknown> {
      readonly initiator?: Component | EntityTransform | undefined;
      readonly args?: Args;
      readonly target?: Emission.ExecutionLevel  | Component[];
    }
  }
}