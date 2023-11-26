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
  private readonly actionRequests: Scene.ActionRequest[] = [];
  @Transformator.Exclude()
  private readonly actionRequestResult = new WeakMap<Scene.ActionRequest, unknown>();
  @Transformator.Exclude()
  private readonly actionRequestResultCallbacks = new WeakMap<Scene.ActionRequest, Function[]>();

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

  private addActionRequest(actionRequest: Scene.ActionRequest) {
    this.actionRequests.push(actionRequest);
  }
  
  public requestEntityInstantiation(entity?: Entity): Scene.ActionRequests.EntityInstantiation {
    const entityInstantiationRequest: any = {
      type: Scene.ActionRequest.Types.EntityInstantiation,
      origin: entity,
    } as const;

    this.addActionRequest(entityInstantiationRequest);
    return entityInstantiationRequest;
  }

  public requestEntityTransformation(entity: Entity, parent?: Entity | null): Scene.ActionRequests.EntityTransformation {
    const entityTransformationRequest = {
      type: Scene.ActionRequest.Types.EntityTransformation,
      entity,
      parent,
    } as const;

    this.addActionRequest(entityTransformationRequest);
    return entityTransformationRequest;
  }

  public requestEntityDestruction(entity: Entity): Scene.ActionRequests.EntityDestruction {
    const entityDestructionRequest = {
      type: Scene.ActionRequest.Types.EntityDestruction,
      entity,
    } as const;

    this.addActionRequest(entityDestructionRequest);
    return entityDestructionRequest;
  }

  public requestComponentActionEmission<Args extends any[], Return>(
   symbol: symbol, options?: Scene.ActionRequests.ActionEmission.Options<Args, Return>
  ): Scene.ActionRequests.ActionEmission<Args, Return> {
    const {
      args = [],
      target = Scene.ActionRequests.ActionEmission.ExecutionLevels.Broadcast,
      initiator,
    } = options ?? {};

    const scene = this;
    const actionEmissionRequest: Scene.ActionRequests.ActionEmission<Args, Return> = {
      type: Scene.ActionRequest.Types.ActionEmission,
      symbol,
      args: args as any,
      target,
      initiator,
      onResolution: function (cb) {
        const arr = scene.actionRequestResultCallbacks.get(this);
        if (!arr) {
          scene.actionRequestResultCallbacks.set(this, [cb]);
        } else {
          arr.push(cb);
        }

        return this;
      }
    };

    this.addActionRequest(actionEmissionRequest);
    return actionEmissionRequest;
  }

  public requestComponentInstantiation<T extends ComponentConstructor>(componentConstructor: T, entity: Entity) {
    const componentInstantiationRequest: Scene.ActionRequests.ComponentInstantiation<T> = {
      type: Scene.ActionRequest.Types.ComponentInstantiation,
      componentConstructor,
      entity,
    };

    this.addActionRequest(componentInstantiationRequest);
    return componentInstantiationRequest;
  }

  public requestComponentDestruction<T extends ComponentConstructor>(componentConstructor: T, entity: Entity) {
    const componentDestructionRequest: Scene.ActionRequests.ComponentDestruction<T> = {
      type: Scene.ActionRequest.Types.ComponentDestruction,
      componentConstructor,
      entity,
    }
    
    this.addActionRequest(componentDestructionRequest)
    return componentDestructionRequest;
  }

  public instantEntityInstantiation(entity: Entity): Entity | undefined {
    const instantiationRequest = this.requestEntityInstantiation(entity);
    this.update();
    return this.actionRequestResult.get(instantiationRequest) as any;
  }

  public instantResolve<T extends Scene.ActionRequest>(actionRequest: T) {
    this.update();

    if (!this.actionRequestResult.has(actionRequest)) {
      throw new Error('No action request match for instant resolve');
    }

    return this.actionRequestResult.get(actionRequest) as Scene.ActionRequest.Response<T>;
  }

  private resolveEntityInstantitationRequest(instantiationActionRequest: Scene.ActionRequests.EntityInstantiation) {
    const { origin } = instantiationActionRequest;
    const entity = origin ? Objectra.duplicate(origin) : new Entity();
    this.entityInstances.add(entity);
    this.hoistedEntities.add(entity);
    entity['parentScene'] = this;
    return entity;
  }

  private resolveEntityTransformationRequest(transformationActionRequest: Scene.ActionRequests.EntityTransformation) {
    const { entity, parent: newParent = null } = transformationActionRequest;

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

  private resolveEntityDestructionRequest(destructionActionRequest: Scene.ActionRequests.EntityDestruction) {
    const { entity } = destructionActionRequest;

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

  private resolveComponentInstantiationRequest(componentInstantiationRequest: Scene.ActionRequests.ComponentInstantiation) {
    const { componentConstructor, entity } = componentInstantiationRequest;
    const baseConstructor = Component.getBaseclassOf(componentConstructor);
    if (entity.components.findOfType(baseConstructor)) {
      throw new Error(`Component of class ${baseConstructor.name} already exists`);
    }

    const componentInstance = new componentConstructor(entity);
    this.requestComponentActionEmission(Component.onAwake, {
      target: [componentInstance],
    });

    this.componentInstances.add(componentInstance);
    entity.components['hoistingComponents'].set(baseConstructor, componentInstance);
    return componentInstance;
  }

  private resolveComponentDestructionRequest(componentDestructionRequest: Scene.ActionRequests.ComponentDestruction): Component | null {
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

  private resolvePrimitiveActionRequest(actionRequest: Scene.ActionRequest) {
    const { Types } = Scene.ActionRequest;

    type Resolution = ReturnType<
      | typeof this.resolveEntityInstantitationRequest
      | typeof this.resolveEntityTransformationRequest
      | typeof this.resolveEntityDestructionRequest
      | typeof this.resolveComponentInstantiationRequest
      | typeof this.resolveComponentDestructionRequest
    >

    let resolution: Resolution;

    switch(actionRequest.type) {
      case Types.EntityInstantiation:
        resolution = this.resolveEntityInstantitationRequest(actionRequest);
        break;
      
      case Types.EntityTransformation:
        resolution = this.resolveEntityTransformationRequest(actionRequest);
        break;
        
        case Types.EntityDestruction:
          const mrInstance = [...actionRequest.entity.components].find(c => c.constructor.name === 'MeshRenderer');
          if (mrInstance) {
            this.removeEntitySpatialPartion(mrInstance as MeshRenderer);
          }

          resolution = this.resolveEntityDestructionRequest(actionRequest);
        break;

      case Types.ComponentInstantiation:
        resolution = this.resolveComponentInstantiationRequest(actionRequest);
        break;

      case Types.ComponentDestruction:
        if (actionRequest.componentConstructor.name === 'MeshRenderer') {
          const component = actionRequest.entity.components.get(actionRequest.componentConstructor);
          if (component) {
            this.removeEntitySpatialPartion(component as MeshRenderer);
          }
        }

        resolution = this.resolveComponentDestructionRequest(actionRequest) as Component | null;
        break;
    }

    switch(actionRequest.type) {
      case Types.EntityInstantiation:
      case Types.EntityTransformation:
      case Types.ComponentInstantiation:
        if (resolution instanceof Entity) {
          this.recacheEntitySpatialPartition(resolution);
        }

        if (resolution instanceof Component) {
          this.recacheEntitySpatialPartition(resolution.entity);
          break;
        }
        break;
    }

    return resolution;
  }

  private resolveActionRequests() {
    if (this.actionRequests.length === 0) {
      return;
    }

    type AnyGenerator = Component.ActionMethods.Sequential.Generator.Any;
    const self = this;

    const generatorMethodComponentMap = new Map<AnyGenerator, [Component.ActionMethod.Any, Component]>();
    const generatorParentMap = new Map<AnyGenerator, AnyGenerator>();
    const generatorEmissionRequest = new Map<AnyGenerator, Scene.ActionRequests.ActionEmission>();
    const generatorActionRequestHistoryMap = new Map<AnyGenerator, Scene.ActionRequest[]>();
    
    const actionEmissionGeneratorMap = new Map<Scene.ActionRequests.ActionEmission, AnyGenerator[]>();
    const actionRequestResultMap = new Map<Scene.ActionRequest, any>(); // Results for each requested action request
    const actionRequestResponses = new Map<Scene.ActionRequests.ActionEmission, Scene.ActionRequest.Emission.SegmentResponse[]>();

    const currentGeneratorExecutions = new Set<AnyGenerator>(); // Executions that are currently resolving

    let updateQuantity = 0;
    const MAX_UPDATE_QUANTITY = 100000;
    useActionRequestHopperResolve();

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
        useActionRequestHopperResolve();

        // If done, unroll the generator to its parent
        handleItarationResult(executionGenerator, result);
      }

      // Forced update loop
    } while (currentGeneratorExecutions.size > 0);

    for (const [actionRequest, result] of actionRequestResultMap) {
      this.actionRequestResult.set(actionRequest, result);
    }

    // if (updateQuantity > 0) {
    //   this.recacheSpatialPartition();
    // }

    function resolveGeneratorIteration(generator: AnyGenerator) {
      const generatorActionRequestHistory = generatorActionRequestHistoryMap.get(generator) ?? [];
      const lastActionRequest = generatorActionRequestHistory[generatorActionRequestHistory.length - 1];

      let responseArguments;

      if (lastActionRequest) {
        if (actionRequestResultMap.has(lastActionRequest)) {
          responseArguments = actionRequestResultMap.get(lastActionRequest);
        } else if (lastActionRequest?.type === Scene.ActionRequest.Types.ActionEmission) {
          const actionResponse = actionRequestResponses.get(lastActionRequest) ?? [];
          responseArguments = [...actionResponse];
        }
      }

      const yieldRequest = generator.next(responseArguments);
      return yieldRequest;
    }

    function handleItarationResult(generator: AnyGenerator, iteratorResult: IteratorResult<Component.ActionMethods.Sequential.YieldRequest, any>) {
      const generatorParent = generatorParentMap.get(generator);

      if (iteratorResult.done) {
        const actionRequest = generatorEmissionRequest.get(generator) as Scene.ActionRequests.ActionEmission;
        const methodComponent = generatorMethodComponentMap.get(generator);

        if (!methodComponent) {
          throw new Error('Method and component not found for generator');
        }

        const [ method, component ] = methodComponent;

        const emissionExecutionResult: Scene.ActionRequest.Emission.SegmentResponse = { 
          result: iteratorResult.value,
          component,
          method,
        };

        pushElementToMapValue(actionRequestResponses, actionRequest, emissionExecutionResult);

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

      const { value: yieldActionRequest } = iteratorResult;
      if (!yieldActionRequest) {
        return;
      }

      if (Symbol.iterator in yieldActionRequest) {
        throw new Error('Not implemented');
      }

      pushElementToMapValue(generatorActionRequestHistoryMap, generator, yieldActionRequest);

      if (yieldActionRequest.type !== Scene.ActionRequest.Types.ActionEmission) {
        return;
      }

      const yieldedActionEmissionGenerators = actionEmissionGeneratorMap.get(yieldActionRequest);

      if (!yieldedActionEmissionGenerators) {
        return;
      }

      for (const yieldedActionEmissionGenerator of yieldedActionEmissionGenerators) {
        generatorParentMap.set(yieldedActionEmissionGenerator, generator);
      }

      currentGeneratorExecutions.delete(generator);
    }

    function initializeComponentRequestMethod(
      actionEmissionRequest: Scene.ActionRequests.ActionEmission, 
      receiver: Component.ImplicitActionMethodWrapper
    ): Scene.ActionRequest.Emission.MethodInitialization | void {
      const { symbol, args } = actionEmissionRequest;
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
      pushElementToMapValue(actionEmissionGeneratorMap, actionEmissionRequest, generator);

      return { method: eventMethod, generator, component: receiver };
    }

    function initializeEmissionRequest(actionEmissionRequest: Scene.ActionRequests.ActionEmission) {
      const { ExecutionLevels } = Scene.ActionRequests.ActionEmission;

      const { 
        initiator,
        target = Scene.ActionRequests.ActionEmission.ExecutionLevels.EntityBroadcast,
      } = actionEmissionRequest;

      const resolve = (receivers: Component[]) => {
        return (receivers as Component.ImplicitActionMethodWrapper[])
          .map((component) => initializeComponentRequestMethod(actionEmissionRequest, component))
          .filter(Boolean) as Scene.ActionRequest.Emission.MethodInitialization[];
      }

      if (Array.isArray(target)) {
        return resolve(target);
      }

      switch (target) {
        case ExecutionLevels.Broadcast:
          return resolve(self.getComponents());
        
        case ExecutionLevels.EntityBroadcast:
          if (!initiator) {
            throw new Error('Cannot broadcast emission to entity without initiator');
          }

          return resolve([...initiator.entity.components.instances()]);

        case ExecutionLevels.EntityDeepBroadcast:
          if (!initiator) {
            throw new Error('Cannot broadcast emission to entity without initiator');
          }

          const entities = initiator.entity.getFlattenChildren()
          const components = entities.map(entity => [...entity.components]).flat();
          return resolve(components);
      }
    }

    function resolveEmissionRequest(emissionRequest: Scene.ActionRequests.ActionEmission) {
      const methodInitializationResults = initializeEmissionRequest(emissionRequest);

      for (const methodInitializationResult of methodInitializationResults) {
        if (!methodInitializationResult) {
          continue;
        }

        if ('result' in methodInitializationResult) {
          const response: Scene.ActionRequest.Emission.SegmentResponse<any> = { 
            result: methodInitializationResult.result,
            component: methodInitializationResult.component,
            method: methodInitializationResult.method,  
          };

          pushElementToMapValue(actionRequestResponses, emissionRequest, response);

          // const cbs = self.actionRequestResultCallbacks.get(emissionRequest);
          // if (cbs) {
          //   for (const cb of cbs) {
          //     cb();
          //   }
          // }
          continue;
        }

        const { generator } = methodInitializationResult;
        generatorEmissionRequest.set(generator, emissionRequest);
        currentGeneratorExecutions.add(generator)
      }
    }

    function useActionRequestHopperResolve() {
      do {
        const emissionRequests: Scene.ActionRequests.ActionEmission[] = [];
        // First resolve all primitive action requests
        for (const actionRequest of self.actionRequests) {
          if (actionRequest.type === Scene.ActionRequest.Types.ActionEmission) {
            emissionRequests.push(actionRequest);
            continue;
          }
  
          const result = actionRequestResultMap.has(actionRequest) 
            ? actionRequestResultMap.get(actionRequest) 
            : self.resolvePrimitiveActionRequest(actionRequest);

          actionRequestResultMap.set(actionRequest, result);
        }

        self.actionRequests.length = 0;
  
        for (const emissionRequest of emissionRequests) {
          resolveEmissionRequest(emissionRequest);
        }

        // Action request hopper like loop
      } while (self.actionRequests.length > 0);
    }
  }

  public start() {
    this.recacheSpatialPartition();
  }

  public update() {
    this.resolveActionRequests();
  }
}

export namespace Scene {
  export namespace ActionRequest {
    export enum Types {
      EntityInstantiation,
      EntityDestruction,
      EntityTransformation,
      ComponentInstantiation,
      ComponentDestruction,
      ActionEmission,
    }

    export interface Base<T extends Types> {
      readonly type: T;
    }

    export type ActionRequestCollection = ActionRequest[] | readonly ActionRequest[];

    export type ValidRequestFormat = ActionRequest | ActionRequestCollection | undefined;
    export type Response<T extends ValidRequestFormat> = (
      T extends ActionRequestCollection ? ActionRequestCollectionResponse<T> :
      T extends ActionRequest ? ActionRequestResponse<T> : 
      T
    );

    type ActionRequestResponse<T extends ActionRequest> = (
      T extends ActionRequests.EntityInstantiation ? Entity : 
      T extends ActionRequests.EntityTransformation ? boolean :
      T extends ActionRequests.EntityDestruction ? boolean :
      T extends ActionRequests.ComponentInstantiation ? Component :
      T extends ActionRequests.ComponentDestruction ? boolean :
      T extends ActionRequests.ActionEmission<any, infer U> 
        ? ActionRequest.Emission.ClusterResponse<U> :
      never
    );

    type ActionRequestCollectionResponse<T extends ActionRequestCollection> = { 
      [K in keyof T]: Response<T[K] & ActionRequest>
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
    }
  }

  export namespace ActionRequests {
    export interface EntityInstantiation extends ActionRequest.Base<ActionRequest.Types.EntityInstantiation> {
      readonly origin?: Entity;
    }

    export interface EntityDestruction extends ActionRequest.Base<ActionRequest.Types.EntityDestruction> {
      readonly entity: Entity;
    }

    export interface EntityTransformation extends ActionRequest.Base<ActionRequest.Types.EntityTransformation> {
      readonly entity: Entity;
      readonly parent?: Entity | null | undefined;
    }

    export interface ComponentInstantiation<T extends ComponentConstructor = ComponentConstructor> extends ActionRequest.Base<ActionRequest.Types.ComponentInstantiation> {
      readonly componentConstructor: T;
      readonly entity: Entity;
    }

    export interface ComponentDestruction<T extends ComponentConstructor = ComponentConstructor> extends ActionRequest.Base<ActionRequest.Types.ComponentDestruction> {
      readonly componentConstructor: T;
      readonly entity: Entity;
    }

    export interface ActionEmission<
      Args extends unknown[] = unknown[], _Return = unknown
    > extends ActionRequest.Base<ActionRequest.Types.ActionEmission> {
      readonly initiator?: Component | EntityTransform | undefined;
      readonly symbol: symbol;
      readonly args: Args;
      readonly target?: ActionEmission.ExecutionLevels | Component[];
      readonly onResolution: (cb: () => void) => this;
    }

    export namespace ActionEmission {
      export interface Options<Args extends unknown[] = unknown[], _Return = unknown> {
        readonly initiator?: Component | EntityTransform | undefined;
        readonly args?: Args;
        readonly target?: ActionEmission.ExecutionLevels | Component[];
      }

      export enum ExecutionLevels {
        Broadcast,
        EntityBroadcast,
        EntityDeepBroadcast,
      }
    }
  }

  export type ActionRequest = (
    | ActionRequests.EntityInstantiation
    | ActionRequests.EntityTransformation
    | ActionRequests.EntityDestruction
    | ActionRequests.ComponentInstantiation
    | ActionRequests.ComponentDestruction
    | ActionRequests.ActionEmission<any, any>
  );

  export type ActionRequestFromType<T extends ActionRequest.Types> = Omit<ActionRequest & { type: T }, 'type'>;
}
