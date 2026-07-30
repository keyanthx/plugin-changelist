import { defineConfig } from 'vite';

// Build config mirrors the official ship-studio plugins (plugin-vercel).
//
// Two things matter here and both are easy to get wrong:
//
// 1. React must NOT end up in the bundle. Ship Studio hands its own React to
//    plugins on `window.__SHIPSTUDIO_REACT__`; a second copy means broken hooks
//    and an instantly crashing plugin. `external` + `paths` below rewrite every
//    `import ... from 'react'` into a tiny data: module that re-exports the host
//    global instead.
//
// 2. The classic JSX transform (createElement) is used on purpose. The automatic
//    runtime's `jsx(type, props, key)` has a different signature to
//    `createElement(type, props, ...children)`, so shimming one to the other puts
//    the React key where a child belongs and keys render as visible text.
export default defineConfig({
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'ShipReact.createElement',
    jsxFragment: 'ShipReact.Fragment',
    jsxInject: 'const ShipReact = window.__SHIPSTUDIO_REACT__;',
  },
  build: {
    lib: {
      entry: 'src/index.tsx',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: '__SHIPSTUDIO_REACT__',
          'react-dom': '__SHIPSTUDIO_REACT_DOM__',
        },
        // Map the externals onto the host globals. The bundle is loaded from a
        // Blob URL, so a bare `import 'react'` would have nothing to resolve to.
        paths: {
          react:
            'data:text/javascript,export default window.__SHIPSTUDIO_REACT__;export const useState=window.__SHIPSTUDIO_REACT__.useState;export const useEffect=window.__SHIPSTUDIO_REACT__.useEffect;export const useRef=window.__SHIPSTUDIO_REACT__.useRef;export const useCallback=window.__SHIPSTUDIO_REACT__.useCallback;export const useMemo=window.__SHIPSTUDIO_REACT__.useMemo;export const createElement=window.__SHIPSTUDIO_REACT__.createElement;',
          'react-dom': 'data:text/javascript,export default window.__SHIPSTUDIO_REACT_DOM__;',
        },
      },
    },
    // Readable output: plugin bundles are committed to git and reviewed by hand.
    minify: false,
  },
});
