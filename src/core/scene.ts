import { Component, ComponentConstructor } from "./component";
import { Entity } from "./entity";
import { Objectra, Transformator } from 'objectra';
import { pushElementToMapValue } from "../utils/buildin-helpers";

@Transformator.Register<Scene>()
export class Scene implements Iterable<Entity> {
  public name = 'Scene';

  private readonly hoistedEntities = new Set<Entity>();
  private readonly entityInstances = new Set<Entity>();

  private readonly actionRequests = new Set<Scene.ActionRequest>();
  // private readonly typedActionRequestMap = new Map<Scene.ActionRequest.Types, Scene.ActionRequest[]>();

  public [Symbol.iterator]() {
    return this.entityInstances.values();
  }

  public getHoistedEntities() {
    return [...this.hoistedEntities];
  }

  public getEntities() {
    return [...this];
  }

  private addActionRequest(actionRequest: Scene.ActionRequest) {
    this.actionRequests.add(actionRequest);
    (actionRequest as any).id = Math.floor(Math.random() * 100);
    // const typedActionRequests = this.typedActionRequestMap.get(actionRequest.type);
    // const actionRequests = typedActionRequests ?? [];
    // actionRequests.push(actionRequest);
    
    // if (!typedActionRequests) {
    //   this.typedActionRequestMap.set(actionRequest.type, actionRequests);
    // }
  }
  
  public requestEntityInstantiation(entity?: Entity): Scene.ActionRequests.EntityInstantiation {
    const entityInstantiationRequest: any = {
      id: Math.random(),
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
    symbol: symbol, args: Args = [] as any, initiator?: Component,
  ): Scene.ActionRequests.ActionEmission<Args, Return> {
    const actionEmissionRequest = {
      type: Scene.ActionRequest.Types.ActionEmission,
      symbol,
      args: args ?? [] as any[],
      initiator,
    } as const;

    this.addActionRequest(actionEmissionRequest);
    return actionEmissionRequest;
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

  public getComponentsOfType<T extends ComponentConstructor>(type: T) {
    type Instance = InstanceType<T>;
    const components = this.getComponents();
    const targets: Instance[] = [];
    for (const component of components) {
      if (component instanceof type) {
        targets.push(component as Instance);
      }
    }
    
    return targets;
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
      entity.parent?.['children'].delete(entity);
      this.hoistedEntities.add(entity);
    }

    entity['parentEntity'] = newParent;
    entity.transform['updateRelativeLocalTransform']();
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

    entity.parent?.['children'].delete(entity);
    entity['parentScene'] = null;
    entity['parentEntity'] = null;
    return true;
  }

  private resolvePrimitiveActionRequest(actionRequest: Scene.ActionRequest) {
    const { Types } = Scene.ActionRequest;

    switch(actionRequest.type) {
      case Types.EntityInstantiation:
        return this.resolveEntityInstantitationRequest(actionRequest);
      
      case Types.EntityTransformation:
        return this.resolveEntityTransformationRequest(actionRequest);
      
      case Types.EntityDestruction:
        return this.resolveEntityDestructionRequest(actionRequest);
    }
  }

  public update() {
    this.resolveActionRequests();
  }

  private resolveActionRequests() {
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
    const MAX_UPDATE_QUANTITY = 100;
    useActionRequestHopperResolve();

    do {
      if (updateQuantity++ > MAX_UPDATE_QUANTITY) {
        throw new Error('Update limit exceeded');
      }

      // Update all existing action requests
      // Use array.from to prevent the loop from behaving unexpectly because of `currentGeneratorExecutions` mutations

      for (const executionGenerator of currentGeneratorExecutions) {
        // resolveGeneratorIteration(executionGenerator);
        const result = resolveGeneratorIteration(executionGenerator);

        // Resolve all added action requests
        useActionRequestHopperResolve();

        // If done, unroll the generator to its parent
        handleItarationResult(executionGenerator, result);
      }

      // Forced update loop
    } while (currentGeneratorExecutions.size > 0);

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
      const receivers = self.getComponents() as Component.ImplicitActionMethodWrapper[];

      return receivers
        .map((component) => initializeComponentRequestMethod(actionEmissionRequest, component))
        .filter(Boolean) as Scene.ActionRequest.Emission.MethodInitialization[];
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
          self.actionRequests.delete(actionRequest);
          if (actionRequest.type === Scene.ActionRequest.Types.ActionEmission) {
            emissionRequests.push(actionRequest);
            continue;
          }
  
          const result = actionRequestResultMap.has(actionRequest) 
            ? actionRequestResultMap.get(actionRequest) 
            : self.resolvePrimitiveActionRequest(actionRequest);

          actionRequestResultMap.set(actionRequest, result);
        }
  
        for (const emissionRequest of emissionRequests) {
          resolveEmissionRequest(emissionRequest);
        }

        // Action request hopper like loop
      } while (self.actionRequests.size > 0);
    }
  }
}

export namespace Scene {
  export namespace ActionRequest {
    export enum Types {
      EntityInstantiation,
      EntityDestruction,
      EntityTransformation,
      ActionEmission,
      Recache,
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

    export interface ActionEmission<
      Args extends unknown[] = unknown[], _Return = unknown
    > extends ActionRequest.Base<ActionRequest.Types.ActionEmission> {
      readonly initiator?: Component | undefined;
      readonly symbol: symbol;
      readonly args: Args;
    }

    export interface Recache extends ActionRequest.Base<ActionRequest.Types.Recache> {}
  }

  export type ActionRequest = (
    | ActionRequests.EntityInstantiation
    | ActionRequests.EntityTransformation
    | ActionRequests.EntityDestruction
    | ActionRequests.ActionEmission<any, any>
  );

  export type ActionRequestFromType<T extends ActionRequest.Types> = Omit<ActionRequest & { type: T }, 'type'>;
}
