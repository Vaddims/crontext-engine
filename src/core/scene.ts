import { Component } from "./component";
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
import { TickCacheManager } from "./cache/tick-cache-manager";
import { Engine } from "./engine";

export namespace Signal {
  export enum Type {
    EntityInstantiation,
    EntityDestruction,
    EntityTransformation,
    ComponentInstantiation,
    ComponentDestruction,
    SignalEmission,
  }
}

enum CacheKey {
  SPC = 'spatialPartitionClusters',
}

const onInstantiationSymbol = Symbol('Scene.onInstantiation');

@Transformator.Register<Scene>()
export class Scene implements Iterable<Entity> {
  public name = 'Scene';

  private readonly hoistedEntities = new Set<Entity>();
  private readonly entityInstances = new Set<Entity>();
  private readonly componentInstances = new Set<Component>();

  constructor() {
    const componentConstructors = Component.getUsableComponentConstructors();
    componentConstructors.map(constructor => (<any>constructor)[onInstantiationSymbol]?.(this));
  }

  @Transformator.Exclude()
  public readonly cacheManager = new TickCacheManager();

  @Transformator.Exclude()
  public readonly cache = this.cacheManager.cache;

  @Transformator.Exclude()
  private readonly signals: Signal[] = [];

  @Transformator.Exclude()
  private readonly signalResult = new WeakMap<Signal, unknown>();

  @Transformator.Exclude()
  private readonly signalResultCallbacks = new WeakMap<Signal, Function[]>();

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
    return this.getComponents().filter(component => component.constructor.name === 'Camera') as unknown as Camera[];
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

  public instantiateEntity(entity?: Entity) {
    return this.useSignal<Signal.EntityInstantiation>({
      type: Signal.Type.EntityInstantiation,
      origin: entity,
    });
  }

  public emitSignal<Args extends any[], Return>(symbol: symbol, options?: Signal.SignalEmission.Options<Args, Return>) {
    const {
      args = [],
      target = Signal.Emission.ExecutionLevel.Broadcast,
      initiator,
    } = options ?? {};

    return this.useSignal<Signal.SignalEmission<Args, Return>>({
      type: Signal.Type.SignalEmission,
      symbol,
      args: args as any,
      target,
      initiator,
    });
  }

  public useSignal<const T extends Signal>(creationOptions: Signal.Creator<T>) {
    const signal = this.createSignal(creationOptions);
    const functionalSignal = this.createFunctionalSignal(signal);
    this.addSignal(functionalSignal);
    return functionalSignal as T;
  }

  public start() {

  }

  public update() {
    this.resolveSignals();
  }

  private resolvePrimitiveSignal(signal: Signal) {
    const resolver = Scene.signalResolver.get(signal.type);
    if (!resolver) {
      throw new Error(`Resolver not found for signal type (${Signal.Type[signal.type]})`)
    }

    return resolver.call(this, signal);
  }

  private createFunctionalSignal<T extends Signal.Base<any>>(signalCreator: Signal.Creator<T>): T {
    const signal = signalCreator as unknown as T;
    signal.resolve = () => {
      const cachedSignals = [...this.signals];
      const currentSignalIndex = cachedSignals.indexOf(signal);
      if (currentSignalIndex === -1) {
        throw new Error('Action request already resolved');
      }

      cachedSignals.splice(currentSignalIndex, 1);
      this.signals.length = 0;
      this.signals.push(signal);
      this.resolveSignals();
      this.signals.push(...cachedSignals);

      if (!this.signalResult.has(signal)) {
        // TODO RESEE
        // throw new Error(`Signal result is not found for (${Signal.Type[signal.type]})`);
        return undefined;
      }
    
      const res = this.signalResult.get(signal);
      return res
    }

    return signal;
  }

  private createSignal<T extends Signal.Base<any>>(creationOptions: Signal.Creator<T>) {
    const signalFoundation = { ...creationOptions };
    const signal = this.createFunctionalSignal(signalFoundation);
    return signal;
  }

  private addSignal(signal: Signal) {
    this.signals.push(signal);
  }

  private resolveSignals() {
    if (this.signals.length === 0) {
      return;
    }

    type AnyGenerator = Component.SignalMethod.Sequential.Generator.Any;
    const scene = this;

    const generatorMethodComponentMap = new Map<AnyGenerator, [Component.SignalMethod.Any, Component]>();
    const generatorParentMap = new Map<AnyGenerator, AnyGenerator>();
    const generatorEmissionRequest = new Map<AnyGenerator, Signal.SignalEmission>();
    const generatorSignalHistoryMap = new Map<AnyGenerator, Signal[]>();

    const signalEmissionFinishQuantity = new Map<Signal.SignalEmission, number>();
    
    const signalEmissionGeneratorMap = new Map<Signal.SignalEmission, AnyGenerator[]>();
    const signalResultMap = new Map<Signal, Signal.Emission.SegmentResponse<any>[]>(); // Results for each requested signal request
    const signalEmissionResponses = new Map<Signal.SignalEmission, Signal.Emission.SegmentResponse[]>();

    const addSignalResultSegment = (signal: Signal.SignalEmission, emissionExecutionResult: Signal.Emission.SegmentResponse) => {
      pushElementToMapValue(signalEmissionResponses, signal, emissionExecutionResult);

      const responses = signalEmissionResponses.get(signal)!;
      const awaitingResponses = signalEmissionFinishQuantity.get(signal);
      if (responses.length === awaitingResponses) {
        signalResultMap.set(signal, responses)
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

    // TODO Remove from here
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

    function handleItarationResult(generator: AnyGenerator, iteratorResult: IteratorResult<Component.SignalMethod.Sequential.YieldRequest, any>) {
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
  
        const allChildrenExecutionsResolved = Array.from(
          currentGeneratorExecutions
        ).every(
          execution => generatorParentMap.get(execution) !== generatorParent
        );
  
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
      signalEmissionRequest: Signal.SignalEmission, 
      receiver: Component.ImplicitSignalMethodWrapper
    ): Signal.Emission.MethodInitialization | void {
      const { symbol, args } = signalEmissionRequest;
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
      pushElementToMapValue(signalEmissionGeneratorMap, signalEmissionRequest, generator);

      return { method: eventMethod, generator, component: receiver };
    }

    function initializeEmissionRequest(signal: Signal.SignalEmission) {
      const { ExecutionLevel } = Signal.Emission;

      const { 
        initiator,
        target = ExecutionLevel.EntityBroadcast,
      } = signal;

      const resolve = (receivers: Component[]) => {
        signalEmissionFinishQuantity.set(signal, receivers.length);

        const recieverResults = (receivers as Component.ImplicitSignalMethodWrapper[])
          .map((component) => initializeComponentRequestMethod(signal, component))
          .filter(Boolean) as Signal.Emission.MethodInitialization[];

        if (recieverResults.length === 0) {
          signalResultMap.set(signal, []);
        }

        return recieverResults;
      }

      if (Array.isArray(target)) {
        return resolve(target);
      }

      switch (target) {
        case ExecutionLevel.Broadcast:
          return resolve(scene.getComponents());
        
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
        for (const signal of scene.signals) {
          if (signal.type === Signal.Type.SignalEmission) {
            emissionRequests.push(signal);
            continue;
          }
  
          // NO REQUESTS FROM PRIMITIVE ACTION REQUERSTS
          const result = signalResultMap.has(signal) 
            ? signalResultMap.get(signal) 
            : scene.resolvePrimitiveSignal(signal);

          signalResultMap.set(signal, result);
        }

        scene.signals.length = 0;
  
        for (const emissionRequest of emissionRequests) {
          resolveSignalEmissionStage(emissionRequest);
        }

        // Action request hopper like loop
      } while (scene.signals.length > 0);
    }
  }

  public static readonly onInstantiation: typeof onInstantiationSymbol = onInstantiationSymbol;

  private static readonly signalResolver = new Map<Signal.Type, (this: Scene, signal: Signal) => any>();
  static {
    Scene.signalResolver.set(Signal.Type.EntityInstantiation, function(signal) {
      const { origin } = signal as Signal.EntityInstantiation;
      const entity = origin ? Objectra.duplicate(origin) : new Entity();
      this.entityInstances.add(entity);
      this.hoistedEntities.add(entity);
      entity['parentScene'] = this;
      return entity;
    });

    Scene.signalResolver.set(Signal.Type.EntityTransformation, function(signal) {
      const { entity, parent: newParent = null } = signal as Signal.EntityTransformation;

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
    })

    Scene.signalResolver.set(Signal.Type.EntityDestruction, function(signal) {
      const { entity } = signal as Signal.EntityDestruction;

      const entityExisted = this.entityInstances.delete(entity);
      if (!entityExisted) {
        return false;
      }

      if (!entity.parent) {
        this.hoistedEntities.delete(entity);
      }

      for (const component of entity.components) {
        component.destroy().resolve();
      }

      entity.parent?.['children'].delete(entity);
      entity['parentScene'] = null;
      entity['parentEntity'] = null;

      for (const children of entity.getChildren()) {
        children.destroy();
      }

      return true;
    })

    Scene.signalResolver.set(Signal.Type.ComponentInstantiation, function(signal) {
      const { componentConstructor, entity } = signal as Signal.ComponentInstantiation;
      const baseConstructor = Component.getBaseclassOf(componentConstructor);
      if (entity.components.findOfType(baseConstructor)) {
        throw new Error(`Component of class ${baseConstructor.name} already exists`);
      }

      const componentInstance = new componentConstructor(entity);
      this.componentInstances.add(componentInstance);
      entity.components['hoistingComponents'].set(baseConstructor, componentInstance);

      this.emitSignal(Component.onAwake, {
        target: [componentInstance],
      }).resolve();

      return componentInstance;
    });

    Scene.signalResolver.set(Signal.Type.ComponentDestruction, function(signal) {
      const { componentConstructor, entity } = signal as Signal.ComponentDestruction;

      const baseClassOfConstructor = Component.getBaseclassOf(componentConstructor)
      const componentInstance = entity.components['hoistingComponents'].get(baseClassOfConstructor);
      if (!componentInstance) {
        return null;
      }

      this.emitSignal(Component.onDestroy, {
        target: [componentInstance],
      }).resolve();

      this.componentInstances.delete(componentInstance);
      entity.components['hoistingComponents'].delete(baseClassOfConstructor);
      
      return componentInstance;
    });
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
  export type FromType<T extends Signal.Type> = Signal & { type: T };

  export type Collection = Signal[] | readonly Signal[];

  type CollectionResponse<T extends Collection> = { 
    [K in keyof T]: Response<T[K] & Signal>
  }

  export type ValidRequestFormat = Signal | Collection | undefined;
  export type Response<T extends ValidRequestFormat> = (
    T extends Collection ? CollectionResponse<T> :
    T extends Signal ? Response.PrebuildSignal<T> : 
    T
  );

  export namespace Response {
    export type PrebuildSignal<T extends Signal> = (
      T extends Signal.EntityInstantiation ? Entity : 
      T extends Signal.EntityTransformation ? boolean :
      T extends Signal.EntityDestruction ? boolean :
      T extends Signal.ComponentInstantiation ? Component :
      T extends Signal.ComponentDestruction ? boolean :
      T extends Signal.SignalEmission<any, infer U> 
        ? Signal.Emission.ClusterResponse<U> :
      never
    );
  }

  export namespace Emission {
    export type MethodInitialization = MethodInitialization.InstantaneousResponse | MethodInitialization.SequentialResponse;
    export namespace MethodInitialization {
      interface BaseResponse {
        readonly component: Component;
        readonly method: Component.SignalMethod.Instantaneous;
      }

      export interface InstantaneousResponse extends BaseResponse {
        readonly result: unknown;
      } 
      
      export interface SequentialResponse extends BaseResponse {
        readonly generator: Generator<Component.SignalMethod.Sequential.YieldRequest, unknown, unknown>;
      }
    }
    
    export interface SegmentResponse<T = any> {
      readonly component: Component;
      readonly method: Component.SignalMethod;
      readonly result: T;
    }

    export type ClusterResponse<T = any> = SegmentResponse<T>[];

    export enum ExecutionLevel {
      Broadcast,
      EntityBroadcast,
      EntityDeepBroadcast,
    }
  }

  export type Creator<T extends Signal> = Omit<T, 'resolve' | 'onResolution'>;
  export type CreatorOrigin<T extends Creator<Signal>> = T extends Creator<infer U> ? U : never;

  export interface Base<T extends Type> {
    readonly type: T;
    resolve: () => unknown;
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

  export interface ComponentInstantiation<T extends Component.Constructor = Component.Constructor> extends Signal.Base<Signal.Type.ComponentInstantiation> {
    readonly componentConstructor: T;
    readonly entity: Entity;
  }

  export interface ComponentDestruction<T extends Component.Constructor = Component.Constructor> extends Signal.Base<Signal.Type.ComponentDestruction> {
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
  }

  export namespace SignalEmission {
    export interface Options<Args extends unknown[] = unknown[], _Return = unknown> {
      readonly initiator?: Component | EntityTransform | undefined;
      readonly args?: Args;
      readonly target?: Emission.ExecutionLevel | Component[];
    }
  }
}