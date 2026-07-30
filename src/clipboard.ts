/**
 * Copy text to the clipboard, with fallbacks.
 *
 * `navigator.clipboard` can be unavailable or permission-blocked inside a
 * desktop webview, and it wants a real user gesture — so a failure here must
 * never be silent. The caller reports it, because a "sent" item whose prompt
 * never reached the clipboard is the worst outcome in this plugin.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
