import { Engine } from "./engine";

export class Time {
  public static get updateDelta() {
    const context = Engine['contextSimulation'];
    if (!context) {
      throw new Error('Out of engine simulation context');
    }

    return 17;
    // return (Time.getDeltaTimeMiliseconds(context['lastUpdateTime']) / 1000) / context.interimUpdateQuantity;
  }

  public static getDeltaTimeMiliseconds(time: number) {
    return performance.now() - time;
  }
}