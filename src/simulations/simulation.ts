import { CircleCollider, Collider } from "../components";
import { Entity, Vector } from "../core";
import { Collision } from "../core/collision";
import { CollisionDetection } from "../core/systems/collision-systems/collision-detection";
import { CollisionPenetrationResolution, CollisionState } from "../core/systems/collision-systems/collision-penetration-resolution";
import { DetailedCollision } from "../core/detailed-collision";
import { Scene } from "../core/scene";

export class Simulation {
  public updateOnFrameChange = true;
  private activeScene: Scene;
  private running = false;
  
  constructor(scene = new Scene) {
    this.activeScene = scene;
  }

  public get scene() {
    return this.activeScene;
  }

  public loadScene(scene: Scene) {
    this.activeScene = scene;
    this.start();
  }

  public start() {
    this.running = true;
    const entities = this.activeScene.getAllEntities();
    for (const entity of entities) {
      for (const component of entity.components) {
        component.start?.();
      }
    }

    if (this.updateOnFrameChange) {
      requestAnimationFrame(this.update.bind(this));
    }
  }
  
  public update() {
    if (!this.running) {
      return;
    }
    
    const entities = this.activeScene.getAllEntities();
    const entityInitialPositionMap = new Map<Entity, Vector>();
    
    for (const entity of entities) {
      entityInitialPositionMap.set(entity, entity.transform.position.duplicate());
    }

    for (const entity of entities) {
      for (const component of entity.components) {
        if (component instanceof Collider) {
          continue;
        }

        component.update?.();
      }
    }

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];

      // Proccess the collisions component
      const collider = entity.components.findOfType(Collider);
      if (!collider) {
        continue;
      }

      for (let j = i + 1; j < entities.length; j++) {
        const targetEntity = entities[j];

        const targetEntityCollider = targetEntity.components.findOfType(Collider);
        if (!targetEntityCollider) {
          continue;
        }

        const initialPositions = [entityInitialPositionMap.get(entity)!, entityInitialPositionMap.get(targetEntity)!] as [Vector, Vector];
        const collisionDetected = CollisionDetection.detectFrom(collider, targetEntityCollider);
        if (!collisionDetected) {
          continue;
        }

        // const detailedCollision = new DetailedCollision([collider, targetEntityCollider], initialPositions);
        const res = (coll: Collider): CollisionState<Collider> => {
          const initialPos = entityInitialPositionMap.get(coll.entity)!;
          return {
            collider: coll,
            deltaPosition: coll.entity.transform.position.subtract(initialPos),
          }
        }

        const resolutions = [res(collider), res(targetEntityCollider)];
        if (resolutions[0].deltaPosition.magnitude < resolutions[1].deltaPosition.magnitude) {
          resolutions.reverse();
        }

        CollisionPenetrationResolution.resolve({
          colliders: [collider, targetEntityCollider],
          active: resolutions[0],
          passive: resolutions[1],
        });

        for (const component of entity.components) {
          component.onCollision?.(new Collision(targetEntityCollider));
        }

        for (const component of targetEntity.components) {
          component.onCollision?.(new Collision(collider));
        }
        
        //const detailedCollision = new DetailedCollision([collider, targetEntityCollider], initialPositions);
        // const collision = collider.collisionDetection(targetCollider)
        // if (!collision) {
        //   continue;
        // }

        // if (!collider.isTrigger && !targetCollider.isTrigger) {
        //   collider.penetrationResolution(targetCollider);
        //   for (const component of entity.components) {
        //     component.onCollision?.(collision);
        //   }
        // }

        // TODO trigger
      }
    }

    if (this.updateOnFrameChange) {
      requestAnimationFrame(this.update.bind(this));
    }
  }
  
  public stop() {
    this.running = false;
  }

  public get isRunning() {
    return this.running;
  }
}