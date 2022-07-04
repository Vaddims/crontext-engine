import { Vector } from "../../core";
import { Shape } from "../../core/shape";

export class Equilateral extends Shape {
  public readonly edges: number;
  public readonly pivotRotation: number;

  public constructor(edges: number, pivotRotation = 0) {
    const { sin, cos } = Math;

    const fullCircle = Math.PI * 2; 
    const quadrant = Math.PI / 2;
    const vertices: Vector[] = [];
    for (let i = 0; i < edges; i++) {
      const segment = i / edges;
      const rotation = fullCircle * segment + quadrant + pivotRotation;
      vertices.push(new Vector(cos(rotation), sin(rotation)).divide(2));
    }

    super(vertices);
    this.edges = edges;
    this.pivotRotation = pivotRotation;
    
    // super();
    // this.edges = edges;
    // this.pivotRotation = pivotRotation;

    // const quadrant = Math.PI / 2;
    // for (let i = 0; i < edges; i++) {
    //   const rotation = 2 * Math.PI * i / edges + quadrant + pivotRotation;
    //   this.addVertex(Math.cos(rotation), Math.sin(rotation))
    // }
  }
}