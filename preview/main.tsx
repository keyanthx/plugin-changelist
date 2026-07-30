/**
 * Dev preview entry point. `npm run preview` renders the toolbar slot the way
 * Ship Studio would, against the fake context in `setup.ts`.
 */
import { PreviewPluginContext, makeContext } from './setup.ts';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { onActivate, slots } from '../src/index.tsx';

onActivate();

const Toolbar = slots.toolbar;
const Publish = slots.publish;

/**
 * Stands in for Ship Studio's workspace: it re-renders on its own schedule and
 * hands the plugin a brand-new context object each time, the way PluginSlot
 * does. Without this the preview would be a friendlier environment than the
 * real one and would keep hiding context-churn bugs — inputs that reset
 * themselves, views that bounce back, shell commands firing in a loop.
 *
 * It also models the thing that makes pinning work at all: the `toolbar` slot
 * lives inside a dropdown that **unmounts its contents when closed**, while the
 * `publish` slot stays mounted. Toggle the dropdown with the button below — a
 * pinned panel must survive that, and a panel drawn only by the toolbar will
 * visibly die with it. Without this fidelity the preview would happily "prove"
 * a pin feature that falls apart on the first real click.
 */
function Host() {
  const [tick, setTick] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(true);
  const [publishMounted, setPublishMounted] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const ctx = makeContext(); // new identity every render, exactly like the host
  (window as unknown as Record<string, unknown>).__SHIPSTUDIO_PLUGIN_CONTEXT__ = ctx;

  return (
    <PreviewPluginContext.Provider value={ctx}>
      {/* The Plugins dropdown: contents unmount when it closes. */}
      <button className="chrome-btn" id="preview-dropdown-toggle" onClick={() => setDropdownOpen((v) => !v)}>
        Plugins {dropdownOpen ? '▾' : '▸'}
      </button>
      {dropdownOpen ? <Toolbar /> : null}

      {/* The publish slot: always mounted while a workspace is open. */}
      {publishMounted ? <Publish /> : null}

      <button
        className="chrome-btn"
        id="preview-publish-toggle"
        title="Simulate a Ship Studio build without a publish slot"
        onClick={() => setPublishMounted((v) => !v)}
      >
        publish slot: {publishMounted ? 'on' : 'off'}
      </button>

      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 10 }}>
        host renders: {tick}
      </span>
    </PreviewPluginContext.Provider>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Host />);
