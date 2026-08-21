import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, X } from 'lucide-react';

const DISMISSED_KEY = 'emmaus-install-prompt-dismissed';
const INSTALLED_KEY = 'emmaus-install-prompt-installed';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isAppleMobileDevice(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isEmbeddedBrowser(): boolean {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /whatsapp|fbav|fban|instagram| line\//i.test(userAgent) ||
    // Android WebViews identify themselves with "; wv" or a missing Chrome
    // token. They cannot install a PWA reliably and should not be interrupted.
    (/android/i.test(userAgent) && (/;\s*wv\)/i.test(userAgent) || !/chrome\//i.test(userAgent)));
}

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Private browsing can disable storage; the prompt remains usable this visit.
  }
}

/**
 * Offers installation once on a browser's first visit.
 *
 * Chromium supplies the native install event. iOS Safari does not, so it gets
 * concise Add to Home Screen instructions instead. The component is mounted
 * above the router so deep links receive the same first-visit treatment.
 *
 * Embedded browsers (especially WhatsApp) intentionally do not get this
 * prompt. They are excellent for opening shared links, but cannot reliably
 * complete PWA installation; interrupting them can also make link handoff
 * feel like a failed navigation.
 */
export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [isApple, setIsApple] = useState(false);

  useEffect(() => {
    if (isStandalone() || isEmbeddedBrowser() || readFlag(DISMISSED_KEY) || readFlag(INSTALLED_KEY)) return;

    setIsApple(isAppleMobileDevice());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      window.setTimeout(() => setVisible(true), 1200);
    };

    const onInstalled = () => {
      writeFlag(INSTALLED_KEY);
      setVisible(false);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // Safari does not expose beforeinstallprompt. Show its instructions after
    // the same short delay, but only on Apple mobile devices.
    if (isAppleMobileDevice()) {
      window.setTimeout(() => setVisible(true), 1200);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    writeFlag(DISMISSED_KEY);
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent || installing) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') writeFlag(INSTALLED_KEY);
      else writeFlag(DISMISSED_KEY);
      setVisible(false);
      setInstallEvent(null);
    } finally {
      setInstalling(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div
        role="dialog"
        aria-labelledby="install-emmaus-title"
        className="relative mx-auto max-w-[480px] rounded-2xl border border-emerald-900/10 bg-background p-4 shadow-2xl"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          className="absolute right-2 top-2 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={18} />
        </button>
        <div className="flex items-start gap-3 pr-7">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Download size={22} />
          </div>
          <div>
            <h2 id="install-emmaus-title" className="font-semibold text-foreground">
              Install Emmaus
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Keep your daily walks, Bible, and group conversations close at hand.
            </p>
          </div>
        </div>

        {isApple ? (
          <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5 text-sm leading-relaxed text-foreground">
            Tap <ExternalLink size={15} className="mx-0.5 inline-block align-[-2px]" />{' '}
            <strong>Share</strong>, then choose <strong>Add to Home Screen</strong>.
          </p>
        ) : (
          <button
            type="button"
            onClick={install}
            disabled={installing}
            className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {installing ? 'Opening install…' : 'Install Emmaus'}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 w-full rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          Not now
        </button>
      </div>
    </div>
  );
}