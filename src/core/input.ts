import { Engine } from "./engine";
import type { Simulation } from "../simulations";
import type { Camera } from "../components";
import { Vector } from "./vector";

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
        simulation.scene.requestComponentActionEmission(broadcastSymbol, {
          args: [event.key]
        });

        const caseSensitiveKeyAction = Input.caseSensitiveKeyActionMap.get(event.key);
        if (caseSensitiveKeyAction) {
          return simulation.scene.requestComponentActionEmission(caseSensitiveKeyAction[action]);
        }
        
        const caseInsensitiveKeyAction = Input.caseInsensitiveKeyActionMap.get(event.key.toUpperCase());
        if (caseInsensitiveKeyAction) {
          return simulation.scene.requestComponentActionEmission(caseInsensitiveKeyAction[action]);
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

  private static addMouseEventListeners() {
    const handleMouseClick = (symbol: symbol, event: MouseEvent) => {
      Engine.getRunningSimulations().forEach((simulation) => {
        if (event.target !== simulation.renderer.canvas) {
          return;
        }

        const { scene, renderer } = simulation;
        const cameras = scene.getCameras();
        
        const responseMap = new Map<Camera, Input.Mouse.ActionEvent>();
        for (const camera of cameras) {
          const optic = camera.toOptic();
          const screenPoint = new Vector(event.clientX, event.clientY);
          const clientScenePosition = renderer.canvasPointToCoordinates(optic, screenPoint);

          const actionEventResponse: Input.Mouse.ActionEvent = {
            clientScenePosition,
          };

          responseMap.set(camera, actionEventResponse);
        }

        simulation.scene.requestComponentActionEmission(symbol, {
          args: [event, responseMap],
        });
      })
    }

    const handleMouseEvent = (symbol: symbol, event: MouseEvent) => {
      Engine.getRunningSimulations().forEach((simulation) => {
        if (event.target !== simulation.renderer.canvas) {
          return;
        }

        simulation.scene.requestComponentActionEmission(symbol, {
          args: [event],
        });
      })
    }

    document.addEventListener('click', event => handleMouseClick(Input.onMouseClick, event));
    document.addEventListener('dblclick', event => handleMouseClick(Input.onMouseDoubleClick, event));
    document.addEventListener('mousemove', event => handleMouseEvent(Input.onMouseMove, event));
  }

  public static emitStaged(simulation: Simulation) {
    for (const keyDown of this.keyDown) {      
      const caseSensitiveKeyAction = Input.caseSensitiveKeyActionMap.get(keyDown);
      if (caseSensitiveKeyAction) {
        simulation.scene.requestComponentActionEmission(caseSensitiveKeyAction.press);
        continue;
      }
      
      const caseInsensitiveKeyAction = Input.caseInsensitiveKeyActionMap.get(keyDown.toUpperCase());
      if (caseInsensitiveKeyAction) {
        simulation.scene.requestComponentActionEmission(caseInsensitiveKeyAction.press);
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
  public static readonly onMouseDoubleClick = Symbol('InputMouseDoubleClick');
  public static readonly onMouseMove = Symbol('InputMouseMove');
}

export namespace Input {
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
      readonly clientScenePosition: Vector;
    }
  } 
}
