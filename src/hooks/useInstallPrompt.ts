import { useCallback, useEffect, useState } from 'react';

/**
 * P6.4: captures Chrome's `beforeinstallprompt` so the install affordance
 * lives in our header instead of a surprise mini-infobar, and hides it once
 * the app is installed. Non-Chromium platforms (no event) simply never set
 * `canInstall` — the button stays out of the layout.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt(): { canInstall: boolean; install: () => void } {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // the header button owns the prompt
      setPromptEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => setPromptEvent(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(() => {
    if (!promptEvent) return;
    void promptEvent.prompt();
    // A deferred prompt is single-use; drop it once the choice resolves.
    void promptEvent.userChoice.finally(() => setPromptEvent(null));
  }, [promptEvent]);

  return { canInstall: promptEvent !== null, install };
}
