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
    const pointOpticsInformation = renderer.getRenderingOpticCaptures(new Vector(event.offsetX, event.offsetY));
    const captures = pointOpticsInformation.map((poi) => ({
      ...poi,
      renderer,
      getCoordsInScenePosition: () => (
        renderer.canvasPointToCoordinates(poi.optic, new Vector(event.offsetX, event.offsetY)) ?? Vector.zero
      ),
    }));

    const composedCaptures = [...captures] as any;
    composedCaptures.fromInspector = captures.filter(capture => capture.renderer.constructor.name === 'SimulationInspectorRenderer');
    composedCaptures.mostRelevantInspector = composedCaptures.fromInspector[0] ?? null;
    composedCaptures.lockInspectorViewTransformation = false;
    composedCaptures.isSelectedAtInspector = (capture: Input.Mouse.Capture, entity: Entity) => {
      if (capture.renderer.constructor.name !== 'SimulationInspectorRenderer') {
        return false;
      }

      return (<SimulationInspectorRenderer>capture.renderer).inspector.selectedEntities.has(entity);
    }

    return composedCaptures;
  }

  private static addMouseEventListeners() {
    const callRendererInputActions = (renderer: Renderer, symbol: Symbol, event: MouseEvent, captures: Input.Mouse.Captures) => {
      if (!(renderer as any)[symbol as any]) {
        return;
      }

      (renderer as any)[symbol as any](event, captures);
    }

    const handleMouseClick = (symbol: symbol, event: MouseEvent) => {
      if (!event.target) {
        return;
      }

      const renderer = Engine.getCanvasRenderer(event.target as HTMLCanvasElement);
      if (!renderer) {
        return;
      }

      event.preventDefault();

      const captures = Input.createCaptures(event, renderer);

      renderer.simulation.scene.emitSignal(symbol, {
        args: [event, captures],
      }).resolve();

      if (!captures.lockInspectorViewTransformation) {
        callRendererInputActions(renderer, symbol, event, captures);
      }
    }

    const handleMouseEvent = (symbol: symbol, event: MouseEvent) => {
      Engine.renderers.forEach((renderer) => {
        if (event.target !== renderer.canvas) {
          return;
        }

        const captures = Input.createCaptures(event, renderer);        
        renderer.simulation.scene.emitSignal(symbol, {
          args: [event, captures],
        }).resolve();

        if (!captures.lockInspectorViewTransformation) {
          callRendererInputActions(renderer, symbol, event, captures);
        }
      })
    }

    document.addEventListener('click', event => handleMouseClick(Input.onMouseClick, event));
    document.addEventListener('dblclick', event => handleMouseClick(Input.onMouseDoubleClick, event));
    document.addEventListener('contextmenu', event => handleMouseClick(Input.onMouseSecondaryClick, event))
    document.addEventListener('mousemove', event => handleMouseEvent(Input.onMouseMove, event));
    document.addEventListener('mousedown', event => handleMouseClick(Input.onMouseDown, event));
    document.addEventListener('mouseup', event => handleMouseClick(Input.onMouseUp, event));
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
  export type MouseEventResolution = Map<Camera, Input.Mouse.ActionEvent>;
  export interface ComponentActions {
    [Input.onMouseClick]?(event: MouseEvent, captures: Input.Mouse.Captures): Component.SignalMethodResponse;
    [Input.onMouseDown]?(event: MouseEvent, captures: Input.Mouse.Captures): Component.SignalMethodResponse<any>;
    [Input.onMouseUp]?(event: MouseEvent, captures: Input.Mouse.Captures): Component.SignalMethodResponse;
    [Input.onMouseMove]?(event: MouseEvent, captures: Input.Mouse.Captures): Component.SignalMethodResponse;
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
    export interface ActionEvent {
      readonly renderer: Renderer;
      readonly optic: Optic | null;
      readonly clientScenePosition: Vector;
    }

    export interface Capture<R extends Renderer = Renderer> extends Renderer.OpticCapture {
      readonly renderer: R;
      readonly getCoordsInScenePosition: () => Vector;
    }

    export type Captures = Capture[] & {
      readonly fromInspector: Capture<SimulationInspectorRenderer>[];
      readonly mostRelevantInspector: Capture<SimulationInspectorRenderer> | null;
      readonly isSelectedAtInspector: (capture: Capture, entity: Entity) => boolean;
      lockInspectorViewTransformation: boolean;
    };
  } 
}
