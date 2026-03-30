/**
 * fast-deep-equal-shim.ts
 *
 * vtk.js imports fast-deep-equal as:
 *   import DeepEqual from 'fast-deep-equal';
 *
 * The real fast-deep-equal@3.1.3 is CJS-only (module.exports = function equal(...))
 * and does NOT provide a named 'default' export in ESM context.
 *
 * This shim provides a proper ESM default export.
 */

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if ((a as object).constructor !== (b as object).constructor) return false;
    let length: number;
    let i: number;
    if (Array.isArray(a) && Array.isArray(b)) {
      length = a.length;
      if (length !== b.length) return false;
      for (i = length; i-- !== 0;)
        if (!equal(a[i], b[i])) return false;
      return true;
    }
    if ((a instanceof Map) && (b instanceof Map)) {
      if (a.size !== b.size) return false;
      const entries = Array.from(a.entries());
      for (let ei = 0; ei < entries.length; ei++) {
        const [key, val] = entries[ei];
        if (!b.has(key) || !equal(val, b.get(key))) return false;
      }
      return true;
    }
    if ((a instanceof Set) && (b instanceof Set)) {
      if (a.size !== b.size) return false;
      const vals = Array.from(a.values());
      for (let vi = 0; vi < vals.length; vi++) {
        if (!b.has(vals[vi])) return false;
      }
      return true;
    }
    if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
      const aa = a as Uint8Array;
      const bb = b as Uint8Array;
      length = aa.length;
      if (length !== bb.length) return false;
      for (i = length; i-- !== 0;)
        if (aa[i] !== bb[i]) return false;
      return true;
    }
    if (a instanceof RegExp && b instanceof RegExp) {
      return a.source === b.source && a.flags === b.flags;
    }
    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
    const keys = Object.keys(a as object);
    length = keys.length;
    if (length !== Object.keys(b as object).length) return false;
    for (i = length; i-- !== 0;)
      if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
    for (i = length; i-- !== 0;) {
      const key = keys[i];
      if (!equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
    }
    return true;
  }
  // NaN check
  return a !== a && b !== b; // eslint-disable-line no-self-compare
}

export default equal;
