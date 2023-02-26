import { Transformator } from "objectra";

@Transformator.Register()
export class Layer {
  @Transformator.ArgumentPassthrough()
  public readonly name: string;
  constructor(name: string) {
    this.name = name;
    Layer.registrations.add(this);
  }

  public [Symbol.toPrimitive]() {
    return this.name;
  }

  public duplicate() {
    return new Layer(this.name);
  }

  public static readonly registrations = new Set<Layer>();

  public static create(name: string) {
    const layer = new Layer(name);
    return layer;
  }

  public static instances() {
    return Array.from(Layer.registrations);
  }

  public static find(name: string) {
    return Array.from(Layer.registrations).find(registration => registration.name === name) || null;
  }

  public static readonly ignoreRaycast = Layer.create('Ignore Raycast');
  public static readonly camera = Layer.create('Camera');
}