import { Camera } from "../components/camera";
import { Engine } from "../core";
import { Renderer } from "../core/renderer";
import { Simulation } from "../simulations/simulation";

export class SimulationRenderer extends Renderer {
  public readonly simulation: Simulation;
  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.simulation = new Simulation(this);
    this.render();
    Engine['registeredRenderers'].add(this);
  }

  public render() {
    const { context, canvasSize } = this;
    const { scene } = this.simulation;

    context.save();
    context.clearRect(0, 0, ...canvasSize.raw);

    context.beginPath();
    context.rect(0, 0, ...canvasSize.raw);
    context.closePath();
    context.clip();

    for (const camera of scene.getComponentsOfType(Camera)) {
      camera.render(this);
    }

    context.restore();

    requestAnimationFrame(this.render.bind(this));
  }
}