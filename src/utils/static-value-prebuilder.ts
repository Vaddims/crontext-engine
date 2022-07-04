export function staticValuePrebuilder<T>(generator: (target: T) => T) {
  return function (target: object, key: string) {
    const object = target as { [key: string]: T };
    const value = object[key];
    
    Object.defineProperty(target, key, {
      configurable: false,
      enumerable: true,
      get: () => generator(value),
    });
  }
}
