import { SimulationInspectorRenderer } from "../renderers";
import { SimulationInspectorRenderingPipeline } from "../rendering-pipelines";
import { Rectangle } from "../shapes";
import { Color } from "./color";
import { Entity } from "./entity";
import { Renderer } from "./renderer";
import { Shape } from "./shape";
import { Vector } from "./vector";

export class Gizmos {
  constructor(
    public readonly renderer: SimulationInspectorRenderer, 
    private readonly renderingPipeline: SimulationInspectorRenderingPipeline
  ) {}

  readonly colorPallete = {
    selectedAccessories: new Color(43, 155, 233),
    selectedOutline: new Color(34, 85, 254),
  }

  public get currentScene() {
    return this.renderer.inspector.simulation.scene;
  }

  public useMask(vertices: readonly Vector[] | Vector[], renderInMask: () => void) {
    const { remove: removeMask } = this.renderingPipeline.createMask(vertices);
    renderInMask();
    removeMask();
  }

  public renderLine(pivot: Vector, end: Vector, color = Color.black, width = 2) {
    this.renderingPipeline.renderLine(pivot, end, color, width);
  }

  public renderDirectionalLine(pivot: Vector, vector: Vector, color = Color.black) {
    const end = pivot.add(vector);
    this.renderLine(pivot, end, color);
  }

  public renderCircle(center: Vector, radius: number, color = Color.black) {
    this.renderingPipeline.renderCircle(center, radius, color);
  }

  public renderRectangle(center: Vector, size: number, color = Color.black) {
    this.renderingPipeline.renderShape(new Rectangle().withScale(size), center, 0, color);
  }

  public renderDisk(center: Vector, radius: number, color = Color.black) {
    this.renderingPipeline.renderDisk(center, radius, color);
  }

  public highlightVertices(vertices: Vector[] | readonly Vector[], color = Color.black) {
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

  public renderText(fulcrum: Vector, text: string, size = 2, color = Color.black) {
    this.renderingPipeline.renderText(fulcrum, text, size, color);
  }

  public renderFixedText(fulcrum: Vector, text: string, size = 2, color = Color.black) {
    this.renderingPipeline.renderFixedText(fulcrum, text, size, color);
  }

  public renderStaticText(fulcrum: Vector, text: string, size = 2, color = Color.black) {
    this.renderingPipeline.renderStaticText(fulcrum, text, size, color);
  }

  public renderShape(shape: Shape, center: Vector = Vector.zero, rotation: number = 0, color: Color = Color.yellow) {
    this.renderingPipeline.renderShape(shape, center, rotation, color);
  }

  public uni_renderShape(shape: Shape, color: Color) {
    this.renderingPipeline.uni_renderShape(shape, color);
  }

  public renderFixedShape(shape: Shape, color = Color.red) {
    this.renderingPipeline.renderFixedShape(shape, color);
  }
}