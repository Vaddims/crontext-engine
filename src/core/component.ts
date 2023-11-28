import { Transformator } from "objectra";
import { FunctionType, getFunctionType } from "objectra/dist/utils";
import { Collider } from "../components";
import type { Collision } from "./collision";
import { Entity } from "./entity";
import type { EntityTransform } from "./entity-transform";
import { Gizmos } from "./gizmos";
import { Scene } from "./scene";
import { Constructor } from "objectra/dist/types/util.types";
import { CacheManager } from "./systems/cache-manager";
import { SimulationCacheManager } from "./systems/cache-systems/simulation-cache-manager";

const onInternalUpdate = Symbol('ComponentInternalUpdate');

@Transformator.Register()
export class Component {
  public readonly transform: EntityTransform;

  @Transformator.ConstructorArgument()
  public readonly entity: Entity;

  @Transformator.Exclude()
  protected readonly cacheManager = new SimulationCacheManager();

  @Transformator.Exclude()
  public readonly cache = this.cacheManager.cache;

  constructor(entity: Entity) {
    this.entity = entity;
    this.transform = entity.transform;
  }

  public emit<T extends Component.ActionMethod<any, any, any, any>>(
    actionSymbol: symbol,
    options?: Component.Emit.Options,
  ) {
    const { scene } = this.entity;
    if (!scene) {
      throw new Error();
    }

    return (...args: T extends Component.ActionMethod<infer A> ? A : []) => {
      const requestArguments = args ?? [];
      type ResultType = T extends Component.ActionMethod<any, infer U, any, any> ? U : never;
      return scene.requestComponentActionEmission<typeof requestArguments, ResultType>(actionSymbol, {
        initiator: this,
        args: requestArguments,
        target: Scene.ActionRequests.ActionEmission.ExecutionLevels.EntityBroadcast,
        ...options,
      });
    }
  }

  public [onInternalUpdate]() {
    this.cacheManager.performUpdateActions();
  }

  public destroy() {
    return this.entity.components.destroy(this.constructor as Constructor<Component>);
  }

  public static getBaseclassOf(componentConstructor: ComponentConstructor) {
    let constructor = componentConstructor;
    const getSuperConstructor = (target: ComponentConstructor) => Object.getPrototypeOf(target.prototype).constructor;
    while (![Component, ...Component.baseComponentConstructors].includes(getSuperConstructor(constructor))) {
      constructor = getSuperConstructor(constructor);
    }

    return constructor;
  }

  public static eventMethodIsSequential<T extends Component.ActionMethod<any[], any, any, any[]>>(
    eventMethod: T
  ): eventMethod is Extract<T, ((...args: any) => Generator<any, any, any>)> {
    return getFunctionType(eventMethod) === FunctionType.Generator;
  }

  private static abstractComponentConstructors = new Set<Constructor<Component>>();
  private static baseComponentConstructors = new Set<Constructor>();

  public static Abstract() {
    return (target: Constructor<Component>, context: ClassDecoratorContext) => {
      Component.abstractComponentConstructors.add(target);
    }
  }

  public static Baseclass() {
    return (target: Constructor<Component>, context: ClassDecoratorContext) => {
      Component.baseComponentConstructors.add(target);
    }
  }

  public static getUsableComponentConstructors() {
    const componentConstructors: Constructor<Component>[] = [...Transformator.getTransformatorsOfSuperConstructor(Component)];
    const usableComponentConstructors = componentConstructors.filter(constructor => !Component.abstractComponentConstructors.has(constructor));
    return usableComponentConstructors;
  }

  public static getComponentsWithType(componentConstructors?: Constructor<Component>[]) {
    const usableComponentConstructors = componentConstructors ?? Component.getUsableComponentConstructors();
    const buildins = [];
    const customs = [];

    for (const UsableComponentConstructor of usableComponentConstructors) {
      const isBuildin = [...Transformator.getSuperTransformators(UsableComponentConstructor)].some(transformator => transformator.type.name === 'BuildinComponent');
      if (isBuildin) {
        buildins.push(UsableComponentConstructor);
      } else {
        customs.push(UsableComponentConstructor);
      }
    }

    return {
      buildins,
      customs,
    } as const;
  }

  static readonly onInternalUpdate: typeof onInternalUpdate = onInternalUpdate;
  static readonly onAwake = Symbol('ComponentOnAwake');
  static readonly onStart = Symbol('ComponentOnStart');
  static readonly onUpdate = Symbol('ComponentOnUpdate');
  static readonly onFixedUpdate = Symbol('ComponentOnFixedUpdate');
  static readonly onDestroy = Symbol('EntityOnDestroy');
  static readonly onGizmosRender = Symbol('GizmosOnRender');
  static readonly onCollision = Symbol('EntityOnCollision');
  static readonly onCollisionUpdate = Symbol('EntityOnCollisionUpdate');
}

export type ComponentConstructor<T extends Component = Component> = new (entity: Entity) => T;

type IsolatedEventMethod<Arg extends unknown[] = unknown[]> = Component.ActionMethod<Arg, void>;
type IsolatedEventGenerator = ReturnType<Component.ActionMethods.Sequential<[], void>>;
export interface Component {
  [Component.onAwake]?(): void;
  [Component.onAwake]?(): IsolatedEventGenerator;
  [Component.onAwake]?: IsolatedEventMethod;

  [Component.onStart]?(): void;
  [Component.onStart]?(): IsolatedEventGenerator;
  [Component.onStart]?: IsolatedEventMethod;

  [Component.onUpdate]?(): void;
  [Component.onUpdate]?(): IsolatedEventGenerator;
  [Component.onUpdate]?: IsolatedEventMethod;

  [Component.onFixedUpdate]?(): void;
  [Component.onFixedUpdate]?(): IsolatedEventGenerator;
  [Component.onFixedUpdate]?: IsolatedEventMethod;

  [Component.onDestroy]?(): void;
  [Component.onDestroy]?(): IsolatedEventGenerator;
  [Component.onDestroy]?: IsolatedEventMethod;

  [Component.onGizmosRender]?(gizmos: Gizmos): void;
  [Component.onGizmosRender]?(gizmos: Gizmos): ReturnType<Component.ActionMethods.Sequential<[Gizmos], void>>;
  [Component.onGizmosRender]?: Component.ActionMethod<[Gizmos], void>;

  [Component.onCollision]?(collision: Collision<Collider>): void;
  [Component.onCollision]?(collision: Collision<Collider>): ReturnType<Component.ActionMethods.Sequential<[Collision<Collider>], void>>;
  [Component.onCollision]?: Component.ActionMethod<[Collision<Collider>], void>;
}

export namespace Component {
  export namespace Emit {
    export interface Options {
      readonly target?: Scene.ActionRequests.ActionEmission.ExecutionLevels | Component[];
    }
  }

  export namespace ActionMethods {
    export type Instantaneous<Args extends unknown[] = unknown[], Return = unknown> = (...args: Args) => Return;
    export type Sequential<
      Args extends unknown[] = [], 
      Return = unknown,
      YieldRequest = Sequential.YieldRequest,
      YieldResult = unknown,
    > = ((...args: Args) => Generator<YieldRequest, Return, YieldResult>);

    export namespace Sequential {
      export type YieldRequest = Scene.ActionRequest | Iterable<Scene.ActionRequest> | undefined;
      export type Generator<YieldRequest extends Sequential.YieldRequest = Sequential.YieldRequest, Return = unknown, YieldResult = unknown> = globalThis.Generator<YieldRequest, Return, YieldResult>;
      
      export namespace Generator {
        export type Any = Generator<Sequential.YieldRequest, any, any>;
      } 
    }
  }

  export type ActionMethod<
    Args extends unknown[] = unknown[],
    Return = unknown,
    YieldRequest = ActionMethods.Sequential.YieldRequest, 
    YieldResult = unknown,
  > = (
    | ActionMethods.Instantaneous<Args, Return>
    | ActionMethods.Sequential<Args, Return, YieldRequest, YieldResult>
  );

  export namespace ActionMethod {
    export type GeneratorFrom<T> = T extends ActionMethod<any, any, any, any>
    ? GeneratorFromEventMethod<T>
    : never;

    export type GeneratorFromEventMethod<T extends ActionMethod<any, any, any, any>> = (
      T extends (...args: any[]) => Generator<any, any, any>
      ? ReturnType<T>
      : never
    );

    export type Any = ActionMethod<any, any, any, any>;
  }

  export type ImplicitActionMethodWrapper = Component & { [key: symbol]: Component.ActionMethod | undefined };

  export type ActionResponse<T extends Scene.ActionRequest.ValidRequestFormat> = Scene.ActionRequest.Response<T>;
}
