/* eslint-disable @typescript-eslint/no-explicit-any */
import { firstValueFrom } from 'rxjs';
import { DataStoreToken } from './DataStoreToken';
import { DataCompartmentOptions, RetentionOptions } from './Compartments';
import { ConfiguredDataSource } from './ConfiguredDataSource';
import { DataCompartment } from './DataCompartment';
import { Hash, ILookup, Lookup } from './Lookup';
import { ICompartmentStorage } from './ICompartmentStorage';
/**
 * Represents a data source used to resolve an entity by key.
 */
export interface IEntityResolver<Key, Entity> {
  /**
   * An idempotent function used to load the entity.
   * @param key The key of the entity to load
   */
  resolve: (key: Key) => Promise<Entity>;
}
/**
 * Adapts a function to the IEntityResolver<Key, Entity> interface.
 */
export class ConfiguredEntityResolver<Key, Entity> implements IEntityResolver<Key, Entity> {
  constructor(private readonly resolver: (key: Key) => Promise<Entity>) {}
  /**
   * An idempotent function used to load the entity.
   * @param key The key of the entity to load
   */
  resolve(key: Key): Promise<Entity> {
    return this.resolver(key);
  }
}
/**
 * Provides strongly-typed configuration options for an individual entity compartment.
 */
interface IRepositoryCompartmentOptions {
  /**
   * Optional configuration for controlling how frequently the entity is reloaded.
   * If no configuration is provided, the entity will be retained in-memory until it is manually updated.
   */
  retention?: RetentionOptions;
}

/**
 * Provides strongly-typed configuration options for an individual entity compartment.
 */
export interface RepositoryCompartmentOptions<Key, Entity> extends IRepositoryCompartmentOptions {
  /**
   * The data source used to fill a compartment.
   */
  resolver: IEntityResolver<Key, Entity>;
}
/**
 * Represents a set of entity compartments.
 */
export interface IRepository<Registry> extends ICompartmentStorage {
  /**
   * Clears the cached value for the specified key/id.
   * @param key The key of the compartment to clear.
   * @param id The id of the entity to clear.
   */
  clear<Key extends string | number>(key: keyof Registry, id: Key): void;
  /**
   * Clears all cached values for the specified key.
   * @param key The key of the compartment to clear.
   */
  clearAll(key: keyof Registry): void;
  /**
   * Gets a data compartment that is configured to retrieve the specific entity.
   * @param key The key of the compartment to retrieve.
   * @param id The id of the entity to retrieve.
   */
  get<Key extends string | number, Response>(key: keyof Registry, id: Key): DataCompartment<Response>;
  /**
   * Modifies the underlying value of the specified key/id.
   * @param key The key of the compartment
   * @param id The id of the entity
   * @param modifier The function used to modify the current value.
   */
  modify<Key extends string | number, Model>(
    key: keyof Registry,
    id: Key,
    modifier: (currentValue: Model) => Promise<Model>,
  ): Promise<void>;
  /**
   * Resets the repository by clearing all caches.
   */
  reset(): void;
  /**
   * The token used to identify the repository.
   */
  token: DataStoreToken;
}
/**
 * Represents a set of entity compartments.
 */
export class Repository<Registry> implements IRepository<Registry> {
  private readonly compartmentLookups: Hash<ILookup<string | number, DataCompartment<unknown>>>;
  constructor(
    readonly token: DataStoreToken,
    readonly managedTokens: DataStoreToken[],
    private readonly lookups: { [key: string | number]: ILookup<string | number, DataCompartment<unknown>> },
  ) {
    this.compartmentLookups = {};
    const entries = Object.entries(lookups);
    entries.forEach(([key, value]) => {
      this.compartmentLookups[key] = value;
    });
  }

  /**
   * Clears the cached value for the specified key/id.
   * @param key The key of the compartment to clear.
   * @param id The id of the entity to clear.
   */
  clear<Key extends string | number>(key: keyof Registry, id: Key): void {
    const lookup = this.findLookup<Response>(key);
    lookup.clear(id);
  }
  /**
   * Clears all the cached values for the specified key.
   * @param key The key of the compartment to clear.
   */
  clearAll(key: keyof Registry): void {
    const lookup = this.findLookup<Response>(key);
    lookup.clearAll();
  }
  /**
   * Gets a data compartment that is configured to retrieve the specific entity.
   * @param key The key of the compartment to retrieve.
   * @param id The id of the entity to retrieve.
   */
  get<Key extends string | number, Response>(key: keyof Registry, id: Key): DataCompartment<Response> {
    const lookup = this.findLookup<Response>(key);
    return lookup.find(id as string | number);
  }
  /**
   * Modifies the underlying value of the specified key/id.
   * @param key The key of the compartment
   * @param id The id of the entity
   * @param modifier The function used to modify the current value.
   */
  async modify<Key extends string | number, Model>(
    key: keyof Registry,
    id: Key,
    modifier: (currentValue: Model) => Promise<Model>,
  ): Promise<void> {
    const stronglyTypedCompartment = this.get<Key, Model>(key, id);
    const currentValue = await firstValueFrom(stronglyTypedCompartment.value$);
    const newValue = await modifier(currentValue);

    stronglyTypedCompartment.next(newValue);
  }
  /**
   * Resets the repository by clearing all caches.
   */
  reset(): void {
    const entries = Object.entries(this.lookups);
    entries.forEach(([, value]) => {
      value.clearAll();
    });
  }

  private findLookup<Response>(key: keyof Registry): ILookup<string | number, DataCompartment<Response>> {
    const lookup = this.compartmentLookups[key as string] as ILookup<string | number, DataCompartment<Response>>;
    if (!lookup) {
      throw new Error(`Could not find compartment "${String(key)}".`);
    }

    return lookup;
  }
}
/**
 * Creates a repository to hold compartments for each item in the specified registry.
 * @param registry The registry used to configure the various entity options
 * @example
 * ```ts
 * import { RepositoryCompartmentOptions } from '@aesop-fables/scrinium';
 *
 * // In this example, we'll be looking up videos by id
 * interface Video {
 *  id: string;
 *  title: string;
 *  url: string;
 * }
 *
 * // Now we define the interface that's used to configure each entity
 * interface VideoRegistry {
 *   videos: RepositoryCompartmentOptions<string, Video>;
 * }
 *
 * const repository = createRepository<VideoRegistry>({
 *  videos: {
 *    resolver: new ConfiguredEntityResolver<string, Video>((id) => axios.get(`/videos/${id}`)),
 *  },
 * });
 *
 * // This returns a `DataCompartment`.
 * const videoCompartment = repository.get<string, Video>('videos', '1');
 * ```
 */
export function createRepository<Registry extends Record<string, any>>(
  token: DataStoreToken,
  registry: Registry,
): IRepository<Registry> {
  const entries = Object.entries(registry);
  const managedTokens = entries.map(([key]) => token.compartment(key));
  const lookups: { [key: string | number]: ILookup<string | number, DataCompartment<unknown>> } = {};
  entries.forEach(([key, value]) => {
    lookups[key] = new Lookup<string | number, DataCompartment<unknown>>((id) => {
      const entityOptions = value as RepositoryCompartmentOptions<string | number, unknown | undefined>;
      const options: DataCompartmentOptions<unknown | undefined> = {
        loadingOptions: {
          strategy: 'auto',
        },
        retention: entityOptions.retention,
        defaultValue: undefined,
        source: new ConfiguredDataSource(async () => entityOptions.resolver.resolve(id)),
      };

      return new DataCompartment<unknown>(token.compartment(key), options);
    });
  });

  return new Repository(token, managedTokens, lookups);
}
