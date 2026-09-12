import { createRoot } from 'react-dom/client';

import App from './App';
import { installAuthRequestGuard } from './lib/auth-request-guard';
import { installNativeDailyRhythmDeepLink } from './lib/native-daily-rhythm-deep-link';
import { registerServiceWorker } from './lib/register-service-worker';

import './index.css';

try {
  const raw = localStorage.getItem('emmaus_last_appearance_preferences');
  if (raw) {
    const saved = JSON.parse(raw) as { theme?: string; fontSize?: string };
    const root = document.documentElement;
    root.classList.toggle('dark', saved.theme === 'dark');
    root.dataset.fontSize =
      saved.fontSize === 'large' || saved.fontSize === 'extra-large'
        ? saved.fontSize
        : 'standard';
    root.style.colorScheme = saved.theme === 'dark' ? 'dark' : 'light';
  }
} catch {
  // Rendering can continue with the CSS defaults when storage is unavailable.
}

installAuthRequestGuard();

async function bootstrap() {
  await installNativeDailyRhythmDeepLink();
  createRoot(document.getElementById('root')!).render(<App />);
  registerServiceWorker();
}

void bootstrap();
