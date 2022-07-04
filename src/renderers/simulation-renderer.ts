import { Camera } from "../components/camera";
import { Renderer } from "../core/renderer";
import { Simulation } from "../simulations/simulation";

export class SimulationRenderer extends Renderer {
  constructor(canvas: HTMLCanvasElement, public simulation = new Simulation()) {
    super(canvas);
    this.render();
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

    for (const camera of scene.getAllComponentsOfType(Camera)) {
      camera.render(this);
    }

    context.restore();

    requestAnimationFrame(this.render.bind(this));
  }
}