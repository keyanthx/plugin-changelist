import { defineConfig } from 'vite';

// Config for `npm run preview` only — the plugin itself is built by
// vite.config.ts. The difference: React is bundled normally here (the preview
// page has no host to borrow it from) and the entry is preview/index.html.
export default defineConfig({
  root: 'preview',
  server: { port: 5199 },
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'ShipReact.createElement',
    jsxFragment: 'ShipReact.Fragment',
    jsxInject: 'const ShipReact = window.__SHIPSTUDIO_REACT__;',
  },
});
