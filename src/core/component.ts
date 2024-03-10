import { Transformator } from "objectra";
import { FunctionType, getFunctionType } from "objectra/dist/utils";
import { Collider } from "../components";
import type { Collision } from "./collision";
import { Entity } from "./entity";
import type { EntityTransform } from "./entity-transform";
import { Gizmos } from "./gizmos";
import { Scene, Signal } from "./scene";
import { Constructor } from "objectra/dist/types/util.types";
import { CacheManager } from "./cache/cache-manager";
import { TickCacheManager } from "./cache/tick-cache-manager";

const onInternalUpdate = Symbol('ComponentInternalUpdate');

@Transformator.Register()
export class Component {
  public readonly transform: EntityTransform;

  @Transformator.ConstructorArgument()
  public readonly entity: Entity;

  @Transformator.Exclude()
  protected readonly cacheManager = new TickCacheManager();

  @Transformator.Exclude()
  public readonly cache = this.cacheManager.cache;

  constructor(entity: Entity) {
    this.entity = entity;
    this.transform = entity.transform;
  }

  public emit<T extends Component.SignalMethod.Any>(
    actionSymbol: symbol,
    options?: Component.Emission.Options,
  ) {
    const { scene } = this.entity;
    if (!scene) {
      throw new Error();
    }

    return (...args: T extends Component.SignalMethod<infer A> ? A : []) => {
      const requestArguments = args ?? [];
      type ResultType = T extends Component.SignalMethod<any, infer U, any, any> ? U : never;
      return scene.emitSignal<typeof requestArguments, ResultType>(actionSymbol, {
        initiator: this,
        args: requestArguments,
        target: Signal.Emission.ExecutionLevel.EntityBroadcast,
        ...options,
      });
    }
  }

  public [onInternalUpdate]() {
    this.cacheManager.tickAllControllers();
  }

  public destroy() {
    return this.entity.components.destroy(this.constructor as Constructor<Component>);
  }

  public static getBaseclassOf(componentConstructor: Component.Constructor) {
    let constructor = componentConstructor;
    const getSuperConstructor = (target: Component.Constructor) => Object.getPrototypeOf(target.prototype).constructor;
    while (![Component, ...Component.baseComponentConstructors].includes(getSuperConstructor(constructor))) {
      constructor = getSuperConstructor(constructor);
    }

    return constructor;
  }

  public static eventMethodIsSequential<T extends Component.SignalMethod<any[], any, any, any[]>>(
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

export interface Component {
  [Component.onAwake]?(): Component.SignalMethodResponse;
  [Component.onStart]?(): Component.SignalMethodResponse;
  [Component.onUpdate]?(): Component.SignalMethodResponse;
  [Component.onFixedUpdate]?(): Component.SignalMethodResponse;
  [Component.onDestroy]?(): Component.SignalMethodResponse;
  [Component.onGizmosRender]?(gizmos: Gizmos, isShadowSelected: boolean): Component.SignalMethodResponse;
  [Component.onCollision]?(collision: Collision<Collider>): Component.SignalMethodResponse;
}

export namespace Component {
  export type Constructor<T extends Component = Component> = new (entity: Entity) => T;

  export namespace Emission {
    export interface Options {
      readonly target?: Signal.Emission.ExecutionLevel | Component[];
    }
  }

  export type SignalMethod<
    Args extends unknown[] = unknown[],
    Return = unknown,
    YieldRequest = SignalMethod.Sequential.YieldRequest, 
    YieldResult = unknown,
  > = (
    | SignalMethod.Instantaneous<Args, Return>
    | SignalMethod.Sequential<Args, Return, YieldRequest, YieldResult>
  );

  export namespace SignalMethod {
    export type Instantaneous<Args extends unknown[] = unknown[], Return = unknown> = (...args: Args) => Return;
    export type Sequential<
      Args extends unknown[] = [], 
      Return = unknown,
      YieldRequest = Sequential.YieldRequest,
      YieldResult = unknown,
    > = ((...args: Args) => Generator<YieldRequest, Return, YieldResult>);

    export namespace Sequential {
      export type YieldRequest = Signal | Iterable<Signal> | undefined;
      export type Generator<YieldRequest extends Sequential.YieldRequest = Sequential.YieldRequest, Return = unknown, YieldResult = unknown> = globalThis.Generator<YieldRequest, Return, YieldResult>;
      
      export namespace Generator {
        export type Any = Generator<Sequential.YieldRequest, any, any>;
      } 

      export type Return<
        Return = unknown,
      > = ReturnType<Component.SignalMethod.Sequential<[], Return>>;
    }

    export type GeneratorFrom<T> = (
      T extends SignalMethod<any, any, any, any>
      ? GeneratorFromEventMethod<T>
      : never
    );

    export type GeneratorFromEventMethod<T extends SignalMethod<any, any, any, any>> = (
      T extends (...args: any[]) => Generator<any, any, any>
      ? ReturnType<T>
      : never
    );

    export type Any = SignalMethod<any, any, any, any>;
  }

  export type ImplicitSignalMethodWrapper = Component & { [key: symbol]: Component.SignalMethod | undefined };
  export type SignalMethodResponse<Return = void> = SignalMethod.Sequential.Return<Return> | Return;
}
