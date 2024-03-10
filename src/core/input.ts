import { Engine } from "./engine";
import type { Simulation } from "../simulations";
import type { Camera } from "../components";
import { Vector } from "./vector";
import { Component } from "./component";
import { Renderer } from "./renderer";
import { Optic } from "./optic";
import type { SimulationInspectorRenderer } from "../renderers";
import type { Entity } from "./entity";
import { Signal } from "./scene";
import { Writeable } from "objectra/dist/types/util.types";

export class Input {
  private static initiated = false;
  private static readonly caseSensitiveKeyActionMap = new Map<string, Input.KeyAction>();
  private static readonly caseInsensitiveKeyActionMap = new Map<string, Input.KeyAction>();
  
  private static readonly keyDown = new Set<string>();;

  public static on(key: string, caseSensetive = false) {
    if (caseSensetive) {
      const existingSymbol = Input.caseSensitiveKeyActionMap.get(key);
      if (existingSymbol) {
        return existingSymbol;
      } 

      const keyAction = new Input.KeyAction(key);
      Input.caseSensitiveKeyActionMap.set(key, keyAction);
      return keyAction;
    }


    const insensitiveKey = key.toUpperCase();
    const existingSymbol = Input.caseInsensitiveKeyActionMap.get(insensitiveKey);
    if (existingSymbol) {
      return existingSymbol;
    } 
    
    const keyAction = new Input.KeyAction(insensitiveKey);
    Input.caseInsensitiveKeyActionMap.set(insensitiveKey, keyAction);
    return keyAction;
  }

  private static initiate() {
    if (Input.initiated) {
      return;
    }

    Input.initiated = true;

    Input.addKeyEventListeners();
    Input.addMouseEventListeners();
  }

  private static addKeyEventListeners() {
    const emitKeyAction = (event: KeyboardEvent, broadcastSymbol: symbol, action: 'down' | 'up') => {
      Engine.getRunningSimulations().forEach(simulation => {
        simulation.scene.emitSignal(broadcastSymbol, {
          args: [event.key]
        });

        const caseSensitiveKeyAction = Input.caseSensitiveKeyActionMap.get(event.key);
        if (caseSensitiveKeyAction) {
          return simulation.scene.emitSignal(caseSensitiveKeyAction[action]);
        }
        
        const caseInsensitiveKeyAction = Input.caseInsensitiveKeyActionMap.get(event.key.toUpperCase());
        if (caseInsensitiveKeyAction) {
          return simulation.scene.emitSignal(caseInsensitiveKeyAction[action]);
        }
      })
    }

    document.addEventListener('keydown', event => {
      this.keyDown.add(event.key);
      emitKeyAction(event, Input.onKeyDown, 'down');
    });

    document.addEventListener('keyup', (event) => {
      this.keyDown.delete(event.key);
      emitKeyAction(event, Input.onKeyUp, 'up');
    });
  }

  private static createCaptures(
    event: MouseEvent,
    renderer: Renderer
  ): Input.Mouse.Captures {
    const eventOffset = new Vector(event.offsetX, event.offsetY);

    const pointOpticsInformation = renderer.getRenderingOpticCaptures(eventOffset);
    const captures: Input.Mouse.Capture[] = pointOpticsInformation.map((poi) => ({
      ...poi,
      getAsScenePosition: () => (
        renderer.canvasPointToCoordinates(poi.optic, eventOffset) ?? Vector.zero
      ),
    }));

    const composedCaptures = captures as Writeable<Input.Mouse.Captures>;

    // TODO - It main capture should be the one that is at the highest layer and the highest in the hierarchy
    composedCaptures.main = captures[0];

    return composedCaptures as Input.Mouse.Captures;
  }

  private static addMouseEventListeners() {
    const handleMouseEvent = (symbol: symbol, event: MouseEvent) => {
      if (!event.target) {
        return;
      }

      const renderer = Engine.getCanvasRenderer(event.target as HTMLCanvasElement);
      if (!renderer) {
        return;
      }

      event.preventDefault();

      const interaction: Input.Mouse.Interaction = {
        event,
        renderer,
        captures: Input.createCaptures(event, renderer),
      };

      renderer['cacheGroups'].inputReceiver.setValueForAll(true);

      renderer.simulation.scene.emitSignal(symbol, {
        args: [interaction],
      }).resolve();

      if (!renderer.cache[symbol]) {
        return;
      }

      if (symbol in renderer) {
        (renderer as any)[symbol](interaction);
      }
    }

    document.addEventListener('click', event => handleMouseEvent(Input.onMouseClick, event));
    document.addEventListener('dblclick', event => handleMouseEvent(Input.onMouseDoubleClick, event));
    document.addEventListener('contextmenu', event => handleMouseEvent(Input.onMouseSecondaryClick, event))
    document.addEventListener('mousemove', event => handleMouseEvent(Input.onMouseMove, event));
    document.addEventListener('mousedown', event => handleMouseEvent(Input.onMouseDown, event));
    document.addEventListener('mouseup', event => handleMouseEvent(Input.onMouseUp, event));
  }

  public static emitStaged(simulation: Simulation) {
    for (const keyDown of this.keyDown) {      
      const caseSensitiveKeyAction = Input.caseSensitiveKeyActionMap.get(keyDown);
      if (caseSensitiveKeyAction) {
        simulation.scene.emitSignal(caseSensitiveKeyAction.press);
        continue;
      }
      
      const caseInsensitiveKeyAction = Input.caseInsensitiveKeyActionMap.get(keyDown.toUpperCase());
      if (caseInsensitiveKeyAction) {
        simulation.scene.emitSignal(caseInsensitiveKeyAction.press);
        continue;
      }
    }
  }

  static {
    this.initiate();
  }

  public static readonly onKeyDown = Symbol('InputKeyDown');
  public static readonly onKeyUp = Symbol('InputKeyDown');
  public static readonly onKeyPress = Symbol('InputKeyDown');
  public static readonly onMouseClick = Symbol('InputMouseClick');
  public static readonly onMouseDown = Symbol('Input:OnMouse:Down');
  public static readonly onMouseUp = Symbol('Input:OnMouse:Up');
  public static readonly onMouseSecondaryClick = Symbol('InputMouseSecondaryClick');
  public static readonly onMouseDoubleClick = Symbol('InputMouseDoubleClick');
  public static readonly onMouseMove = Symbol('InputMouseMove');
}

export namespace Input {
  export interface ComponentActions {
    [Input.onMouseClick]?(interaction: Input.Mouse.Interaction): Component.SignalMethodResponse;
    [Input.onMouseDown]?(interaction: Input.Mouse.Interaction): Component.SignalMethodResponse;
    [Input.onMouseUp]?(interaction: Input.Mouse.Interaction): Component.SignalMethodResponse;
    [Input.onMouseMove]?(interaction: Input.Mouse.Interaction): Component.SignalMethodResponse;
  }

  export class KeyAction {
    public readonly down: symbol;
    public readonly up: symbol;
    public readonly press: symbol;
  
    constructor(public readonly key: string) {
      this.down = Symbol(`Input:down:${key}`);
      this.up = Symbol(`Input:up:${key}`);
      this.press = Symbol(`Input:press:${key}`);
    }
  }

  export namespace Mouse {
    export interface Capture extends Renderer.OpticCapture<unknown> {
      readonly getAsScenePosition: () => Vector;
    }

    export type Captures = Capture[] & {
      readonly main: Capture;
    };

    export interface Interaction {
      readonly event: MouseEvent;
      readonly renderer: Renderer;
      readonly captures: Captures;
    }
  } 
}
