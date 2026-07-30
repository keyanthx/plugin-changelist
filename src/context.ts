/**
 * Access to the Ship Studio plugin context.
 *
 * Ship Studio exposes its React copy and a per-plugin React context on window
 * globals. Reading the context object through `useContext` (rather than the
 * legacy single global) is what keeps our context ours when several plugins
 * render at the same time.
 */
import type { PluginContextValue } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = window as any;

export function usePluginContext(): PluginContextValue | null {
  const React = w.__SHIPSTUDIO_REACT__;
  const CtxRef = w.__SHIPSTUDIO_PLUGIN_CONTEXT_REF__;

  if (CtxRef && React?.useContext) {
    const ctx = React.useContext(CtxRef) as PluginContextValue | null;
    if (ctx) return ctx;
  }

  // Legacy fallback: a single global, last writer wins.
  return (w.__SHIPSTUDIO_PLUGIN_CONTEXT__ as PluginContextValue | undefined) ?? null;
}

export function useProject() {
  return usePluginContext()?.project ?? null;
}

export function useShell() {
  return usePluginContext()?.shell ?? null;
}

export function useStorage() {
  return usePluginContext()?.storage ?? null;
}

export function useActions() {
  return usePluginContext()?.actions ?? null;
}

export function useInvoke() {
  return usePluginContext()?.invoke ?? null;
}

/** Theme colors, with a dark-ish fallback so the UI never renders unstyled. */
export function useTheme(): PluginContextValue['theme'] {
  return (
    usePluginContext()?.theme ?? {
      bgPrimary: 'var(--bg-primary)',
      bgSecondary: 'var(--bg-secondary)',
      bgTertiary: 'var(--bg-tertiary)',
      textPrimary: 'var(--text-primary)',
      textSecondary: 'var(--text-secondary)',
      textMuted: 'var(--text-muted)',
      border: 'var(--border)',
      accent: 'var(--accent)',
      accentHover: 'var(--accent)',
      action: 'var(--action)',
      actionHover: 'var(--action)',
      actionText: '#fff',
      error: 'var(--error)',
      success: 'var(--success)',
    }
  );
}
