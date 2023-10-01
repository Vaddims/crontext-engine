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

  public withAlpha(alpha: number) {
    const normalizedAlpha = clamp(alpha, 0, 1);
    return new Color(this.red, this.green, this.blue, normalizedAlpha);
  }

  public duplicate() {
    return new Color(this.red, this.green, this.blue, this.alpha);
  }

  public toRgbString() {
    return `${this.red}, ${this.green}, ${this.blue}`;
  }

  public toRGBAString() {
    return `${this.toRgbString()}, ${this.alpha}`;
  }

  public getClosestColorName() {
    const hex = this.toHexString();
    return closestColorName(hex);
  }

  // TODO CHANGE NAME TO toIdentifiedRGBAString
  public toString() {
    return `rgba(${this.toRGBAString()})`;
  }

  public toHexString() {
    return "#" + (1 << 24 | this.red << 16 | this.green << 8 | this.blue).toString(16).slice(1);
  }

  public static createFromHex(hex: string) {
    const normalizedHex = hex.replace(/^#/, '');

    if (normalizedHex.length !== 3 && normalizedHex.length !== 6) {
      throw new Error('Invalid Hex');
    }
  
    const expandedHex = normalizedHex.length === 3
    ? normalizedHex.split('').map((char) => char + char).join('')
    : normalizedHex;
  
    const int = parseInt(expandedHex as string, 16);

    const to255Base = (code: number, bias: number) => (int >> bias) & 255;
    return new Color(to255Base(int, 16), to255Base(int, 8), to255Base(int, 0));
  }

  public getNegativeColor() {
    // Calculate the negative RGB values
    const negativeRed = 255 - this.red;
    const negativeGreen = 255 - this.green;
    const negativeBlue = 255 - this.blue;
  
    // Return the negative color
    return new Color(negativeRed, negativeGreen, negativeBlue, this.alpha);
  }

  public getContrastingColor() {
    // Calculate the relative luminance of the background color
    const relativeLuminance =
      0.2126 * this.red / 255 +
      0.7152 * this.green / 255 +
      0.0722 * this.blue / 255;
  
    // Determine the text color based on the background's brightness
    const color = relativeLuminance > 0.5 ? Color.black : Color.white;
  
    return color;
  }

  public static createRelativeTransparent(color: Color) {
    return color.withAlpha(0);
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


const colorNames: { [key: string]: string } = {
  aliceBlue: "#f0f8ff",
  antiqueWhite: "#faebd7",
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  black: "#000000",
  blanchedAlmond: "#ffebcd",
  blue: "#0000ff",
  blueViolet: "#8a2be2",
  brown: "#a52a2a",
  burlyWood: "#deb887",
  cadetBlue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerBlue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  cyan: "#00ffff",
  darkBlue: "#00008b",
  darkCyan: "#008b8b",
  darkGoldenrod: "#b8860b",
  darkGray: "#a9a9a9",
  darkGreen: "#006400",
  darkKhaki: "#bdb76b",
  darkMagenta: "#8b008b",
  darkOliveGreen: "#556b2f",
  darkOrange: "#ff8c00",
  darkOrchid: "#9932cc",
  darkRed: "#8b0000",
  darkSalmon: "#e9967a",
  darkSeaGreen: "#8fbc8f",
  darkSlateBlue: "#483d8b",
  darkSlateGray: "#2f4f4f",
  darkTurquoise: "#00ced1",
  darkViolet: "#9400d3",
  deepPink: "#ff1493",
  deepSkyBlue: "#00bfff",
  dimGray: "#696969",
  dodgerBlue: "#1e90ff",
  firebrick: "#b22222",
  floralWhite: "#fffaf0",
  forestGreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  ghostWhite: "#f8f8ff",
  gold: "#ffd700",
  goldenrod: "#daa520",
  gray: "#808080",
  green: "#008000",
  greenYellow: "#adff2f",
  honeydew: "#f0fff0",
  hotPink: "#ff69b4",
  indianRed: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lavenderBlush: "#fff0f5",
  lawnGreen: "#7cfc00",
  lemonChiffon: "#fffacd",
  lightBlue: "#add8e6",
  lightCoral: "#f08080",
  lightCyan: "#e0ffff",
  lightGoldenrodYellow: "#fafad2",
  lightGray: "#d3d3d3",
  lightGreen: "#90ee90",
  lightPink: "#ffb6c1",
  lightSalmon: "#ffa07a",
  lightSeaGreen: "#20b2aa",
  lightSkyBlue: "#87cefa",
  lightSlateGray: "#778899",
  lightSteelBlue: "#b0c4de",
  lightYellow: "#ffffe0",
  lime: "#00ff00",
  limeGreen: "#32cd32",
  linen: "#faf0e6",
  magenta: "#ff00ff",
  maroon: "#800000",
  mediumAquamarine: "#66cdaa",
  mediumBlue: "#0000cd",
  mediumOrchid: "#ba55d3",
  mediumPurple: "#9370db",
  mediumSeaGreen: "#3cb371",
  mediumSlateBlue: "#7b68ee",
  mediumSpringGreen: "#00fa9a",
  mediumTurquoise: "#48d1cc",
  mediumVioletRed: "#c71585",
  midnightBlue: "#191970",
  mintCream: "#f5fffa",
  mistyRose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajoWhite: "#ffdead",
  navy: "#000080",
  oldLace: "#fdf5e6",
  olive: "#808000",
  oliveDrab: "#6b8e23",
  orange: "#ffa500",
  orangeRed: "#ff4500",
  orchid: "#da70d6",
  paleGoldenrod: "#eee8aa",
  paleGreen: "#98fb98",
  paleTurquoise: "#afeeee",
  paleVioletRed: "#db7093",
  papayaWhip: "#ffefd5",
  peachPuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderBlue: "#b0e0e6",
  purple: "#800080",
  rebeccaPurple: "#663399",
  red: "#ff0000",
  rosyBrown: "#bc8f8f",
  royalBlue: "#4169e1",
  saddleBrown: "#8b4513",
  salmon: "#fa8072",
  sandyBrown: "#f4a460",
  seaGreen: "#2e8b57",
  seaShell: "#fff5ee",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyBlue: "#87ceeb",
  slateBlue: "#6a5acd",
  slateGray: "#708090",
  snow: "#fffafa",
  springGreen: "#00ff7f",
  steelBlue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  transparent: "#00000000",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whiteSmoke: "#f5f5f5",
  yellow: "#ffff00",
  yellowGreen: "#9acd32",
};

function closestColorName(inputColor: string): string | null {
  // Normalize the input color to lowercase
  const normalizedInputColor = inputColor.toLowerCase();

  // Check if the input color is a named color
  if (colorNames[normalizedInputColor]) {
    return normalizedInputColor;
  }

  // Convert input color to RGB if it's in hex format
  const rgbColor = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalizedInputColor);
  if (rgbColor) {
    const r = parseInt(rgbColor[1], 16);
    const g = parseInt(rgbColor[2], 16);
    const b = parseInt(rgbColor[3], 16);

    let closestColor = "";
    let closestDistance = Number.MAX_VALUE;

    for (const name in colorNames) {
      const hexValue = colorNames[name];
      const namedColor = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexValue);
      if (namedColor) {
        const nr = parseInt(namedColor[1], 16);
        const ng = parseInt(namedColor[2], 16);
        const nb = parseInt(namedColor[3], 16);

        // Calculate Euclidean distance between the RGB values
        const distance = Math.sqrt(
          Math.pow(r - nr, 2) + Math.pow(g - ng, 2) + Math.pow(b - nb, 2)
        );

        if (distance < closestDistance) {
          closestColor = name;
          closestDistance = distance;
        }
      }
    }

    return closestColor;
  }

  return null; // Input color couldn't be matched
}