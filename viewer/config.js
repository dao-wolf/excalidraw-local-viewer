// Where Excalidraw looks for its fonts and its lazy-loaded chunk: viewer/vendor/ (it adds "excalidraw-assets/").
// Without this it would fetch them from unpkg.com. Must run before the Excalidraw bundle loads.
window.EXCALIDRAW_ASSET_PATH = new URL('vendor/', location.href).pathname;
