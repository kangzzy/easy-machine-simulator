declare module 'occt-import-js' {
  // Minimal shim — the library has no shipped types. The runtime is a default
  // function returning a Promise that resolves to an OCCT instance.
  const init: () => Promise<any>;
  export default init;
}
