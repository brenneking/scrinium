/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AutoResolver,
  IInterceptor,
  IServiceContainer,
  Newable,
  interceptorChainFor,
  registerDependency,
} from '@aesop-fables/containr';
import { IAppStorage } from './AppStorage';
import { ScriniumServices } from './ScriniumServices';

export type ProjectionConstructor<T> = new (context: ProjectionContext, ...args: any[]) => T;

export declare type Projectable<Projection> =
  | ProjectionConstructor<Projection>
  | IProjectionFactory<Projection>
  | Newable<Projection>;

export interface ProjectionContext {
  storage: IAppStorage;
  container: IServiceContainer;
}

export interface IProjectionFactory<T> {
  create(context: ProjectionContext): T;
}

export class InjectProjectionContextInterceptor implements IInterceptor<ProjectionContext> {
  resolve(currentValue: any | undefined, container: IServiceContainer): any {
    const storage = currentValue as IAppStorage;
    return {
      container,
      storage,
    };
  }
}

export function injectProjectionContext() {
  return (constructor: Object, propertyKey: string | symbol | undefined, parameterIndex: number): void => {
    registerDependency(constructor, ScriniumServices.AppStorage, parameterIndex, true);
    const chain = interceptorChainFor(constructor, parameterIndex);
    chain.add(new InjectProjectionContextInterceptor());
  };
}

export function createProjection<Projection>(
  storage: IAppStorage,
  container: IServiceContainer,
  constructor: ProjectionConstructor<Projection> | IProjectionFactory<Projection> | Newable<Projection>,
  ...args: any[]
): Projection {
  const context: ProjectionContext = { storage, container };

  if ((constructor as IProjectionFactory<Projection>)?.create) {
    const factory = constructor as IProjectionFactory<Projection>;
    return factory.create(context);
  }

  return AutoResolver.resolve(constructor as Newable<Projection>, container, ...args);
}

export class FromProjectionInterceptor<Projection> implements IInterceptor<Projection> {
  constructor(
    private readonly projection:
      | ProjectionConstructor<Projection>
      | IProjectionFactory<Projection>
      | Newable<Projection>,
  ) {}

  resolve(currentValue: Projection | undefined, container: IServiceContainer): Projection {
    const appStorage = currentValue as IAppStorage;
    return createProjection(appStorage, container, this.projection);
  }
}

export function fromProjection<Projection>(
  projection: ProjectionConstructor<Projection> | IProjectionFactory<Projection> | Newable<Projection>,
) {
  return (constructor: Object, propertyKey: string | symbol | undefined, parameterIndex: number): void => {
    registerDependency(constructor, ScriniumServices.AppStorage, parameterIndex, true);
    const chain = interceptorChainFor(constructor, parameterIndex);
    chain.add(new FromProjectionInterceptor(projection));
  };
}
