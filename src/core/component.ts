import { Transformator } from "objectra";
import { FunctionType, getFunctionType } from "objectra/dist/utils";
import { Collider } from "../components";
import { Collision } from "./collision";
import { Entity } from "./entity";
import { EntityTransform } from "./entity-transform";
import { Gizmos } from "./gizmos";
import { Scene } from "./scene";
import { Constructor } from "objectra/dist/types/util.types";

@Transformator.Register()
export class Component {
  public readonly transform: EntityTransform;

  @Transformator.ArgumentPassthrough()
  public readonly entity: Entity;

  constructor(entity: Entity) {
    this.entity = entity;
    this.transform = entity.transform;
  }

  public emit<T extends Component.ActionMethod<any, any, any, any>>(
    actionSymbol: symbol
  ) {
    const { scene } = this.entity;
    if (!scene) {
      throw new Error();
    }

    return (...args: T extends Component.ActionMethod<infer A> ? A : []) => {
      const requestArguments = args ?? [];
      type ResultType = T extends Component.ActionMethod<any, infer U, any, any> ? U : never;
      return scene.requestComponentActionEmission<typeof requestArguments, ResultType>(actionSymbol, {
        args: requestArguments,
        target: Scene.ActionRequests.ActionEmission.ExecutionLevels.EntityBroadcast,
        initiator: this,
      });
    }
  }

  public destroy() {
    return this.entity.components.destroy(this.constructor as Constructor<Component>);
  }

  public static getBaseclassOf(componentConstructor: ComponentConstructor) {
    let constructor = componentConstructor;
    const getParentConstructor = (target: ComponentConstructor) => Object.getPrototypeOf(target.prototype).constructor;
    while (getParentConstructor(constructor) !== Component) {
      constructor = getParentConstructor(constructor);
    }

    return constructor;
  }

  public static eventMethodIsSequential<T extends Component.ActionMethod<any[], any, any, any[]>>(
    eventMethod: T
  ): eventMethod is Extract<T, ((...args: any) => Generator<any, any, any>)> {
    return getFunctionType(eventMethod) === FunctionType.Generator;
  }

  static readonly onAwake = Symbol('ComponentOnAwake');
  static readonly onStart = Symbol('ComponentOnStart');
  static readonly onUpdate = Symbol('ComponentOnUpdate');
  static readonly onFixedUpdate = Symbol('ComponentOnFixedUpdate');
  static readonly onDestroy = Symbol('EntityOnDestroy');
  static readonly onGizmosRender = Symbol('GizmosOnRender');
  static readonly onCollision = Symbol('EntityOnCollision');
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
