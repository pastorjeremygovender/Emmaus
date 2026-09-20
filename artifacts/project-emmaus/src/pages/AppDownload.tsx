import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, CheckCircle2, Download, Globe2, Smartphone } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { goBackOrFallback } from '@/lib/return-context';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function AppDownload() {
  const [, setLocation] = useLocation();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const nativeApp = useMemo(
    () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android',
    [],
  );
  const installedWebApp = useMemo(() => !nativeApp && isStandalone(), [nativeApp]);
  const isApple = /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  useEffect(() => {
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', captureInstall);
    return () => window.removeEventListener('beforeinstallprompt', captureInstall);
  }, []);

  async function installWebApp() {
    if (!installEvent || installing) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
      setInstallEvent(null);
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[560px] items-center px-4">
          <button
            type="button"
            onClick={() => goBackOrFallback('/', setLocation)}
            className="-ml-2 flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Go back"
          >
            <ArrowLeft size={21} />
          </button>
          <h1 className="flex-1 pr-9 text-center text-sm font-semibold">Get Emmaus</h1>
        </div>
      </header>

      <main className="mx-auto max-w-[560px] px-5 py-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Smartphone size={30} />
        </div>
        <div className="mt-5 text-center">
          <h2 className="font-serif text-[28px] font-medium">Emmaus, wherever you are</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Walk with Jesus, read the Bible and stay connected through Emmaus on the web or as an installed app.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {(nativeApp || installedWebApp) && (
            <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <CheckCircle2 size={21} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">Emmaus is installed</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">You are already using the installed Emmaus app.</p>
              </div>
            </div>
          )}

          {!nativeApp && !installedWebApp && installEvent && (
            <button
              type="button"
              onClick={installWebApp}
              disabled={installing}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Download size={19} />
              {installing ? 'Opening install…' : 'Install Emmaus'}
            </button>
          )}

          {!nativeApp && !installedWebApp && !installEvent && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <Download size={20} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Install Emmaus</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {isApple
                      ? 'In Safari, tap Share and choose Add to Home Screen.'
                      : 'Open your browser menu and choose Install app or Add to Home screen.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <Link
            href="/walk"
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold hover:bg-muted/60"
          >
            <Globe2 size={19} className="text-primary" />
            Open Emmaus on the web
          </Link>

          {!nativeApp && (
            <p className="px-2 pt-2 text-center text-[12px] leading-relaxed text-muted-foreground">
              The Google Play download will be added here as soon as the Emmaus listing is publicly available.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
