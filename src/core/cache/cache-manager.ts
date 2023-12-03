import { IndexableObject } from "objectra/dist/types/util.types";

const uncomputedSymbol = Symbol('CacheManager.uncomputed');
export class CacheManager<Plugin extends Cache.Entry.Plugin = Cache.Entry.Plugin, Controller extends Cache.Entry.Controller = Cache.Entry.Controller> {
  protected readonly cacheEntries: IndexableObject<Cache.Entry<Plugin>> = {};

  public readonly controller: IndexableObject<Controller>;
  public readonly cache: IndexableObject<any>;

  public getMetadataHelperFunctions(propertyKey: string | symbol) {
    const findMetadata = () => this.cacheEntries[propertyKey];
    const createAndApplyMetadata = () => this.cacheEntries[propertyKey] = CacheManager.createMetadata();
    const useMetadata = () => findMetadata() ?? createAndApplyMetadata();

    return {
      findMetadata,
      createAndApplyMetadata,
      useMetadata,
    }
  }

  public createController(propertyKey: string | symbol): Cache.Entry.Controller<Plugin> {
    const {
      findMetadata,
      createAndApplyMetadata,
      useMetadata,
    } = this.getMetadataHelperFunctions(propertyKey);

    return {
      setPlugin: (plugin) => {
        const metadata = findMetadata();
        if (!metadata) {
          if (!plugin) {
            return;
          }

          const newMetadata = createAndApplyMetadata();
          newMetadata.plugin = plugin;
          return;
        }

        if (!plugin) {
          return delete metadata.plugin;
        }

        metadata.plugin = plugin;
        return true;
      },
      get: <T>(): T | undefined => {
        const metadata = findMetadata();
        if (!metadata) {
          return undefined;
        }

        if (metadata.plugin) {
          if (metadata.plugin.onGet) {
            return metadata.plugin.onGet(metadata);
          }

          if (metadata.plugin.useOnlyPluginAccessors) {
            return undefined;
          }
        }

        if (metadata.value === uncomputedSymbol) {
          return undefined;
        }

        return metadata.value as T;
      },
      set: (newValue) => {
        const metadata = useMetadata();
        if (metadata.plugin) {
          if (metadata.plugin.onSet) {
            return metadata.plugin.onSet(metadata, newValue);
          }

          if (metadata.plugin.useOnlyPluginAccessors) {
            return false;
          }
        }

        metadata.value = newValue;
        return true;
      },
      clear: () => {
        const metadata = findMetadata();
        if (!metadata) {
          return true;
        }

        if (metadata.plugin) {
          if (metadata.plugin.onClear) {
            return metadata.plugin.onClear(metadata);
          }

          if (metadata.plugin.useOnlyPluginAccessors) {
            throw new Error(`Plugin(${metadata.plugin.constructor.name}) does support entry clear`);
          }
        }

        metadata.value = uncomputedSymbol;
        return true;
      },
      delete: () => {
        return delete this.cacheEntries[propertyKey];
      }
    }
  }

  constructor() {
    this.controller = new Proxy({}, {
      get: (_, propertyKey): Cache.Entry.Controller<Plugin> => this.createController(propertyKey),
    });

    this.cache = new Proxy({}, {
      get: (_, propertyKey) => {
        return this.controller[propertyKey].get();
      },

      set: (_, propertyKey, newValue) => {
        this.controller[propertyKey].set(newValue);
        return true;
      },

      deleteProperty: (_, propertyKey) => {
        return this.controller[propertyKey].clear();
      }
    });
  }

  private static createMetadata<Plugin extends Cache.Entry.Plugin = Cache.Entry.Plugin>(): Cache.Entry<Plugin> {
    return {
      value: uncomputedSymbol,
    }
  }

  private static readonly uncomputed: typeof uncomputedSymbol = uncomputedSymbol;
}

export namespace Cache {
  export interface Entry<Plugin extends Entry.Plugin = Entry.Plugin, T = any> {
    plugin?: Plugin;
    value: unknown | typeof uncomputedSymbol;
    payload?: T;
  }

  export namespace Entry {
    export interface Plugin {
      useOnlyPluginAccessors?: boolean;
      onGet?(metadata: Entry): any;
      onSet?(metadata: Entry, newValue: unknown): void;
      onClear?(metadata: Entry): boolean;
    }

    export interface Controller<Plugin extends Entry.Plugin = Entry.Plugin> {
      setPlugin: (plugin: Plugin | null) => void;
      get: <T = unknown>() => T | undefined;
      set: (newValue: unknown) => void;
      clear: () => boolean;
      delete: () => boolean;
    }
  }
}