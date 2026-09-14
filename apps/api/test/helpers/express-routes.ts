import express, { type Express } from 'express';

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: Layer[] };
  mountPath?: string;
}

interface RouterLike {
  stack: Layer[];
}

type Use = (this: RouterLike, ...args: unknown[]) => unknown;

export interface RegisteredRoute {
  method: string;
  /** Full Express path, e.g. `/v1/organizations/:organizationId`. */
  path: string;
}

const RECORDING = Symbol('recordsMountPaths');

/**
 * Express 5's router keeps each route's own path (`layer.route.path`), but
 * not the path a sub-router was mounted at: `use()` compiles it into a
 * matcher and drops the string. This wraps `Router.prototype.use` to keep it
 * on every layer it creates, so the whole tree can be walked afterwards.
 *
 * Every router in the app is created when its module is first evaluated, so
 * this must run before the app is imported: import it dynamically after.
 */
export function recordMountPaths(): void {
  const prototype = (express.Router as unknown as { prototype: { use: Use & { [RECORDING]?: true } } }).prototype;
  const originalUse = prototype.use;
  if (originalUse[RECORDING]) {
    return;
  }

  const use: Use & { [RECORDING]?: true } = function (this: RouterLike, ...args: unknown[]) {
    const firstNewLayer = this.stack.length;
    const result = originalUse.apply(this, args);
    const mountPath = typeof args[0] === 'string' ? args[0] : '/';
    for (const layer of this.stack.slice(firstNewLayer)) {
      layer.mountPath = mountPath;
    }
    return result;
  };
  use[RECORDING] = true;
  prototype.use = use;
}

/** Every method + full path the app's router answers, sub-routers included. */
export function listRoutes(app: Express): RegisteredRoute[] {
  const { router } = app as unknown as { router: RouterLike };
  return collectRoutes(router.stack, '/');
}

function collectRoutes(stack: Layer[], prefix: string): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];

  for (const layer of stack) {
    if (layer.route) {
      const path = joinPaths(prefix, layer.route.path);
      for (const method of Object.keys(layer.route.methods).filter((name) => name !== '_all')) {
        routes.push({ method, path });
      }
    } else if (layer.handle.stack) {
      if (layer.mountPath === undefined) {
        throw new Error('Found a router mounted before recordMountPaths() ran; import the app after calling it');
      }
      routes.push(...collectRoutes(layer.handle.stack, joinPaths(prefix, layer.mountPath)));
    }
  }

  return routes;
}

function joinPaths(prefix: string, path: string): string {
  const joined = `${prefix}/${path}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}
