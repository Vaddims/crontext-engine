import { CacheManager, Cache } from "./cache-manager";

export class TickCacheManager extends CacheManager<TickCache.Entry.Plugin, TickCache.Entry.Controller> {
  override createController(propertyKey: string | symbol): TickCache.Entry.Controller {
    const {
      findMetadata,
    } = this.getMetadataHelperFunctions(propertyKey);

    return {
      ...super.createController(propertyKey),
      tick: () => {
        const metadata = findMetadata();
        if (!metadata) {
          return;
        }

        if (!metadata.plugin || !CacheManager.isCompatibleWithPlugin(TickCacheManager, metadata.plugin)) {
          return;
        }

        if (metadata.plugin.onTick) {
          return metadata.plugin.onTick(metadata);
        }

        if (metadata.plugin.useOnlyPluginAccessors) {
          return;
        }
      }
    }
  }

  override group(...keys: PropertyKey[]) {
    return {
      ...super.group(...keys),
      tickAll: () => {
        keys.map(key => this.controller[key].tick());
      }
    }
  }

  public tickAllControllers(inGroup?: string) {
    Object.values(this.controller).map(controller => controller.tick());
  }
}

export namespace TickCache {
  export namespace Entry {
    export interface Plugin extends Cache.Entry.Plugin {
      onTick?(metadata: Cache.Entry): void;
    }

    export interface Controller<Plugin = Entry.Plugin> extends Cache.Entry.Controller<Entry.Plugin> {
      tick: () => void;
    }
  }

  export namespace Group {
    export interface Controller extends Cache.Group.Controller {
      tickAll: () => void;
    }
  }
}