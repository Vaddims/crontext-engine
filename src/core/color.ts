import { Transformator } from "objectra";
import { clamp } from "../utils/crontext-math";
import { staticValuePrebuilder } from "../utils/static-value-prebuilder";

const Prebuild = staticValuePrebuilder<Color>(color => color.duplicate());

@Transformator.Register()
export class Color {
  @Transformator.ArgumentPassthrough()
  public readonly red: number;
  
  @Transformator.ArgumentPassthrough()
  public readonly green: number;

  @Transformator.ArgumentPassthrough()
  public readonly blue: number;

  @Transformator.ArgumentPassthrough()
  public readonly alpha: number;

  public constructor(red: number, green: number, blue: number, alpha = 1) {
    this.red = clamp(red, 0, 255);
    this.green = clamp(green, 0, 255);
    this.blue = clamp(blue, 0, 255);
    this.alpha = clamp(alpha, 0, 1);
  }

  public duplicate() {
    return new Color(this.red, this.green, this.blue, this.alpha);
  }

  public toString() {
    return `rgba(${this.red}, ${this.green}, ${this.blue}, ${this.alpha})`;
  }

  @Prebuild public static readonly transparent = new Color(255, 255, 255, 0);
  @Prebuild public static readonly white = new Color(255, 255, 255);
  @Prebuild public static readonly black = new Color(0, 0, 0);
  @Prebuild public static readonly yellow = new Color(255, 255, 0);
  @Prebuild public static readonly orange = new Color(255, 125, 0);
  @Prebuild public static readonly red = new Color(255, 0, 0);
  @Prebuild public static readonly green = new Color(0, 255, 0);
  @Prebuild public static readonly blue = new Color(0, 0, 255);
}