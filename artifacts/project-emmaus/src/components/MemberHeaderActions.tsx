import { Link, useLocation } from 'wouter';
import { useAppearance, type AppearanceFontSize } from '@/contexts/AppearanceContext';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Info, Moon, Settings, Sun, User } from 'lucide-react';
import { ShareEmmausButton } from '@/components/ShareEmmausButton';
import { DailyRemindersSettings } from '@/components/DailyRemindersSettings';

export function MemberHeaderActions({ compact = false }: { compact?: boolean }) {
  const [location] = useLocation();
  const { theme, fontSize, setTheme, setFontSize } = useAppearance();
  const actionSize = compact ? 40 : 44;
  const iconSize = compact ? 17 : 19;

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary active:bg-primary/10 ${
              compact ? 'min-h-[40px] min-w-[40px]' : 'min-h-[44px] min-w-[44px]'
            }`}
            aria-label="About Emmaus"
            title="About Emmaus"
            data-testid="about-emmaus-trigger"
          >
            <Info size={iconSize} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[min(22rem,calc(100vw-1rem))] max-h-[min(30rem,calc(100dvh-2rem))] overflow-y-auto rounded-2xl p-4"
        >
          <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
            <Info size={17} className="text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">About Emmaus</h2>
          </div>
          <div className="space-y-3 pt-3 text-[13px] leading-relaxed text-muted-foreground">
            <p>
              Emmaus is a Christian discipleship app created to help you walk with Jesus, engage with Scripture and stay connected to the life of the Local Church.
            </p>
            <p>
              It offers a calm place to read the Bible, pray, reflect, follow Walks and take your next faithful step with Jesus.
            </p>
            <p>
              Emmaus uses technology—including AI—to assist you, but it does not replace Scripture, the Holy Spirit, pastors, Christian community or the Local Church.
            </p>
            <p>Everything in Emmaus is guided by one conviction:</p>
            <p className="font-semibold tracking-wide text-foreground">
              It’s All About JESUS.
            </p>
          </div>
        </PopoverContent>
      </Popover>
      <Link
        href="/personal"
        className={`flex items-center justify-center rounded-full transition-colors hover:bg-primary/5 active:bg-primary/10 ${
          compact ? 'min-h-[40px] min-w-[40px]' : 'min-h-[44px] min-w-[44px]'
        } ${
          location === '/personal' || location.startsWith('/personal/')
            ? 'text-primary'
            : 'text-muted-foreground'
        }`}
        aria-label="My Journey"
        title="My Journey"
        aria-current={location === '/personal' ? 'page' : undefined}
        data-testid="top-my-journey"
      >
        <User size={iconSize} aria-hidden="true" />
      </Link>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`flex items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/5 active:bg-primary/10 ${
              compact ? 'min-h-[40px] min-w-[40px]' : 'min-h-[44px] min-w-[44px]'
            }`}
            aria-label="Open settings"
            title="Settings"
            data-testid="settings-trigger"
          >
            <Settings size={iconSize} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[min(20rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] space-y-3 overflow-y-auto rounded-2xl p-3"
        >
          <div className="flex items-center gap-2 border-b border-border/60 pb-2">
            <Settings size={16} className="text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Settings</h2>
          </div>
          <DailyRemindersSettings />
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card px-3.5 py-2.5">
            <div className="flex items-center gap-2.5">
              {theme === 'dark'
                ? <Moon size={17} className="text-primary" aria-hidden="true" />
                : <Sun size={17} className="text-amber-600" aria-hidden="true" />}
              <div>
                <Label htmlFor="dark-mode-toggle" className="block cursor-pointer text-[14px] font-semibold">
                  Dark mode
                </Label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Use a darker, gentler colour palette</p>
              </div>
            </div>
            <Switch
              id="dark-mode-toggle"
              checked={theme === 'dark'}
              onCheckedChange={checked => setTheme(checked ? 'dark' : 'light')}
              data-testid="toggle-dark-mode"
            />
          </div>
          <div className="rounded-xl border border-border/50 bg-card px-3.5 py-3">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold">Text size</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Make reading more comfortable</p>
              </div>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {fontSize === 'standard' ? 'Standard' : fontSize === 'large' ? 'Large' : 'Extra large'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Text size">
              {([
                ['standard', 'Standard', 'A'],
                ['large', 'Large', 'A+'],
                ['extra-large', 'Extra large', 'A++'],
              ] as [AppearanceFontSize, string, string][]).map(([value, label, sample]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={fontSize === value}
                  onClick={() => setFontSize(value)}
                  className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                    fontSize === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  <span className="block text-sm font-semibold">{sample}</span>
                  <span className="mt-0.5 block text-[10px]">{label}</span>
                </button>
              ))}
            </div>
            <p
              className="mt-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-base leading-relaxed text-foreground"
              data-testid="text-size-preview"
              aria-live="polite"
            >
              Jesus walks with you through every season.
            </p>
          </div>
        </PopoverContent>
      </Popover>
          <ShareEmmausButton compact={compact} />
    </div>
  );
}