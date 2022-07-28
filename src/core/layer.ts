export class Layer {
  private constructor(public readonly name: string) {}

  public [Symbol.toPrimitive]() {
    return this.name;
  }

  public duplicate() {
    return new Layer(this.name);
  }

  public static readonly registrations = new Set<Layer>();

  public static create(name: string) {
    const layer = new Layer(name);
    Layer.registrations.add(layer);
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