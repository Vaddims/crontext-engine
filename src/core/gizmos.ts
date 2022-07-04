import { SimulationInspectorRenderer } from "../renderers";
import { SimulationInspectorRenderingPipeline } from "../rendering-pipelines";
import { Color } from "./color";
import { Entity } from "./entity";
import { Renderer } from "./renderer";
import { Vector } from "./vector";

export class Gizmos {
  constructor(
    private readonly renderer: SimulationInspectorRenderer, 
    private readonly renderingPipeline: SimulationInspectorRenderingPipeline
  ) {}

  public get currentScene() {
    return this.renderer.inspector.simulation.scene;
  }

  public renderLine(pivot: Vector, end: Vector, color = Color.black) {
    this.renderingPipeline.renderLine(pivot, end, color);
  }

  public renderDirectionalLine(pivot: Vector, vector: Vector, color = Color.black) {
    const end = pivot.add(vector);
    this.renderLine(pivot, end, color);
  }

  public renderCircle(center: Vector, radius: number, color = Color.black) {
    this.renderingPipeline.renderCircle(center, radius, color);
  }

  public renderDisk(center: Vector, radius: number, color = Color.black) {
    this.renderingPipeline.renderDisk(center, radius, color);
  }

  public highlightVertices(vertices: Vector[], color = Color.black) {
    for (let i = 0; i < vertices.length; i++) {
      const vertex = vertices[i];
      const nextVertex = i === vertices.length - 1 ? vertices[0] : vertices[i + 1];
      this.renderLine(vertex, nextVertex, color);
    }
  }

  public renderFixedCircle(center: Vector, radius: number, color = Color.black) {
    this.renderingPipeline.renderFixedCircle(center, radius, color);
  }

  public renderFixedDisk(center: Vector, radius: number, color = Color.black) {
    this.renderingPipeline.renderFixedDisk(center, radius, color);
  }
}