// Stub Next.js' `server-only` marker package for this Node service.
//
// `runTurn` (and friends) live in src/lib/ai-agent/ and start with
// `import "server-only"` so accidental client-bundling fails fast inside the
// Next.js app. In this plain Node process there is no React Server Component
// boundary to enforce; the real package throws on import and would crash the
// service. We intercept the `server-only` module resolution and serve an
// empty module instead.
//
// Loaded via `tsx --import` in the npm scripts so it runs before src/index.ts
// imports the relay bridge.

import Module from "node:module";

type ResolveFn = (request: string, ...rest: unknown[]) => string;
const moduleAny = Module as unknown as {
  _resolveFilename: ResolveFn;
  _cache: Record<string, { exports: unknown; id: string; loaded: boolean }>;
};

const realResolve = moduleAny._resolveFilename;
const STUB_ID = "<pennylime-voice:server-only-stub>";
moduleAny._cache[STUB_ID] = { exports: {}, id: STUB_ID, loaded: true };

moduleAny._resolveFilename = function patched(request, ...rest) {
  if (request === "server-only") return STUB_ID;
  return realResolve.call(this, request, ...rest);
};
