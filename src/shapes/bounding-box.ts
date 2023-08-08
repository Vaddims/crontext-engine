import { Shape } from "../core";

export class BoundingBox {
  public static boundsOverlap(a: Shape, b: Shape) {
    const av = a.vertices;
    const bv = b.vertices;
  
    return av[1].x > bv[0].x && av[0].x < bv[1].x && av[0].y > bv[3].y && av[3].y < bv[0].y;
  }
}