/**
 * P6.3: shared copy-to-clipboard helper with the legacy `execCommand`
 * fallback for the NotAllowedError path (Clipboard API needs a focused
 * document). Resolves true only when a copy actually happened, so callers
 * can show an honest failure state.
 */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
};
