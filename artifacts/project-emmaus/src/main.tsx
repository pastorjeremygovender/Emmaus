import { createRoot } from 'react-dom/client';

import App from './App';
import { installAuthRequestGuard } from './lib/auth-request-guard';
import { registerServiceWorker } from './lib/register-service-worker';

import './index.css';

installAuthRequestGuard();
createRoot(document.getElementById('root')!).render(<App />);

registerServiceWorker();
