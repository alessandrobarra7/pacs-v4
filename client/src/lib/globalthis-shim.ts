/**
 * globalthis-shim.ts
 *
 * vtk.js (used by @cornerstonejs/core) imports globalthis as:
 *   import globalThisShim from 'globalthis';
 *
 * The real globalthis@1.0.3 package is CJS-only (module.exports = getGlobal)
 * and does NOT provide a named 'default' export in ESM context.
 * Vite fails to resolve it when Cornerstone packages are excluded from
 * optimizeDeps (which is required to avoid Web Worker conflicts).
 *
 * This shim provides a proper ESM default export that returns globalThis,
 * matching the expected API: globalThisShim() → native globalThis.
 */

const getGlobal = (): typeof globalThis => globalThis;

export default getGlobal;
