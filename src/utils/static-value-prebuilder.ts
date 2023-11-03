import { ClassDecorator } from "objectra/dist/types/util.types";

export function staticAccessorPrebuilder<T>(generator: (target: T) => T) {
  const accessor: ClassDecorator.Accessor<any, T> = (target, context) => {
    return {
      get() {
        return generator(target.get.call(this));
      },
      set: () => {
        throw new Error('Prebuilder is readonly accessor');
      }
    }
  }

  return accessor;

  // return function (_: undefined, context: ClassFieldDecoratorContext) {
    // const object = target as { [key: string]: T };
    // const value = object[key];
    
    // Object.defineProperty(target, key, {
    //   configurable: false,
    //   enumerable: true,
    //   get: () => generator(value),
    // });
  // }
}
