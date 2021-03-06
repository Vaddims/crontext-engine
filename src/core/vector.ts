import { staticValuePrebuilder } from "../utils/static-value-prebuilder";

type RawVector = [number, number];
type VectorOperationInput = RawVector | Vector | number;
type VectorOperationCallback = (a: number, b: number) => number;

const Prebuild = staticValuePrebuilder<Vector>(vector => vector.duplicate());

export class Vector {
  private 0: number;
  private 1: number;

  constructor(x: number, y: number) {
    this.setRaw([x, y]);
  }

  [Symbol.toStringTag] = `Vector`;

  [Symbol.toPrimitive](type: 'string' | 'number' | 'default') {
    if (type === 'number') {
      return NaN;
    }

    const fixNumber = (number: number) => number % 1 === 0 ? number : number.toFixed(2);
    return `(${fixNumber(this.x)}, ${fixNumber(this.y)})`;
  }

  get magnitude() {
		return Math.sqrt(this.x ** 2 + this.y ** 2);
	}

	get normalized(): Vector {
		return this.magnitude > 0 ? this.divide(this.magnitude) : Vector.zero;
	}

  public get raw(): RawVector {
    return [this[0], this[1]];
  }

  public set raw(vector) {
    [this[0], this[1]] = vector;
  }

  public get x() {
    return this[0];
  }

  public get y() {
    return this[1];
  }

  public rotation() {
    const angle = Math.atan2(this.y, this.x);
    return angle > 0 ? angle : angle + Math.PI * 2;
  }

  public isEqual(vector: Vector) {
    return this.x === vector.x && this.y === vector.y;
  }

  public isAlmostEqual(vector: Vector, range: number) {
    return Vector.distance(this, vector) <= range;
  }

  private setRaw(rawVector: RawVector) {
    [this[0], this[1]] = rawVector;
  }

  public add(...operationInputs: VectorOperationInput[]) {
    return this.performOperation(operationInputs, (a, b) => a + b);
	}

	public subtract(...operationInputs: VectorOperationInput[]) {
    return this.performOperation(operationInputs, (a, b) => a - b);
	}

	public multiply(...operationInputs: VectorOperationInput[]) {
    return this.performOperation(operationInputs, (a, b) => a * b);
	}

	public divide(...operationInputs: VectorOperationInput[]) {
    return this.performOperation(operationInputs, (a, b) => a / b);
	}

  public duplicate() {
    return new Vector(this.x, this.y);
  }

  public toFixed(precision: number) {
    return `Vector(${this.x.toFixed(precision)}, ${this.y.toFixed(precision)})`;
  }

	private performOperation(operationInputs: VectorOperationInput[], accumulator: VectorOperationCallback) {
    const vector = new Vector(this.x, this.y);

		for (const operationInput of operationInputs) {
      if (operationInput instanceof Vector) {
        vector.setRaw([
          accumulator(vector.x, operationInput.x),
          accumulator(vector.y, operationInput.y),
        ]);
        continue;
      } 
      
      if (Array.isArray(operationInput)) {
        vector.setRaw([
          accumulator(vector.x, operationInput[0]), 
          accumulator(vector.y, operationInput[1]),
        ]);
        continue;
      }

      vector.setRaw([
        accumulator(vector.x, operationInput),
        accumulator(vector.y, operationInput),
      ]);
		}

    return vector;
	}

  public static distance(from: Vector, to: Vector) {
    // return Math.sqrt((from.x - to.x) ** 2 + (from.y - to.y) ** 2);
    return from.subtract(to).magnitude;
  }

  public static fromAngle(radians: number) {
    return new Vector(Math.cos(radians), Math.sin(radians));
  }

  public static dot(a: Vector, b: Vector) {
    return a.x * b.x + a.y * b.y;
  }

  public static abs(vector: Vector) {
		return new Vector(Math.abs(vector.x), Math.abs(vector.y));
	}

	public static max(...vectors: Vector[]) {
		let max = Vector.zero;
		for (const vector of vectors) {
      if (vector.magnitude > max.magnitude) {
        max = vector;
      }
    }

		return max;
	}

  public static lerp(a: Vector, b: Vector, t: number) {
    return a.multiply(t).add(b.multiply(1 - t));
  }

  public static get random() {
    return new Vector(Math.random() * 2 - 1, Math.random() * 2 - 1);
  }

	@Prebuild static readonly up = new Vector(0, 1);
	@Prebuild static readonly right = new Vector(1, 0);
	@Prebuild static readonly down = new Vector(0, -1);
	@Prebuild static readonly left = new Vector(-1, 0);
	@Prebuild static readonly one = new Vector(1, 1);
	@Prebuild static readonly zero = new Vector(0, 0);
  @Prebuild static readonly reverseX = new Vector(-1, 1);
  @Prebuild static readonly reverseY = new Vector(1, -1);
  @Prebuild static readonly reverse = new Vector(-1, -1);
	@Prebuild static readonly safePositive = new Vector(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
	@Prebuild static readonly safeNegative = new Vector(Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER);
}