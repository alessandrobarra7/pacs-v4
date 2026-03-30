// ESM shim for 'globalthis' CJS package
// vtk.js imports: import globalThisShim from 'globalthis'
// and calls globalThisShim() to get the global object
const getGlobal = () => globalThis;
export default getGlobal;
