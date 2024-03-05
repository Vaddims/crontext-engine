import { Camera } from "../components/camera";
import { Engine, Optic, Vector } from "../core";
import { Renderer } from "../core/renderer";
import { Simulation } from "../simulations/simulation";

export class SimulationRenderer extends Renderer {
  public readonly simulation: Simulation;
  constructor() {
    super();
    this.simulation = new Simulation(this);
    Engine['registeredRenderers'].add(this);
  }

  public updateTick(): void {
    this.simulation.updateTick();
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

    for (const camera of scene.getComponentsOfType(Camera)) {
      camera.render(this);
    }

    context.restore();
  }

  public getRenderingOpticCaptures(position: Vector): Renderer.OpticCapture<SimulationRenderer.OpticCapturePayload>[] {
    const sceneCameras = this.simulation.scene.getComponentsOfType(Camera);

    const opticInformation: Renderer.OpticCapture<SimulationRenderer.OpticCapturePayload>[] = [];

    for (const camera of sceneCameras) {
      if (!camera.isScreenPointInCamera(position, this)) {
        continue;
      }

      opticInformation.push({
        optic: camera.toOptic(),
        payload: {
          camera
        },
      });
    }

    return opticInformation;
  }
}

export namespace SimulationRenderer {
  export interface OpticCapturePayload {
    readonly camera: Camera;
  }
}