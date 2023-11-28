import { CacheManager, Cache } from "../cache-manager";

export class SimulationCacheManager extends CacheManager<SimulationCache.Entry.Plugin, SimulationCache.Entry.Controller> {
  override createController(propertyKey: string | symbol): SimulationCache.Entry.Controller {
    const {
      findMetadata,
    } = this.getMetadataHelperFunctions(propertyKey);

    return {
      ...super.createController(propertyKey),
      simulationUpdate: () => {
        const metadata = findMetadata();
        if (!metadata) {
          return;
        }

        if (metadata.plugin) {
          if (metadata.plugin.onUpdate) {
            return metadata.plugin.onUpdate(metadata);
          }

          if (metadata.plugin.useOnlyPluginAccessors) {
            return;
          }
        }
      }
    }
  }

  public performUpdateActions() {
    Object.values(this.controller).map(controller => controller.simulationUpdate());
  }
}

export namespace SimulationCache {
  export namespace Entry {
    export interface Plugin extends Cache.Entry.Plugin {
      onUpdate?(metadata: Cache.Entry): void;
    }

    export interface Controller<Plugin = Entry.Plugin> extends Cache.Entry.Controller<Entry.Plugin> {
      simulationUpdate: () => void;
    }
  }
}