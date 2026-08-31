import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'za.co.emmaus.app',
  appName: 'Emmaus',
  webDir: 'dist/public',
  // Native release builds load the published app so authenticated API calls,
  // SSE, LiveKit, and private storage keep the same-origin web behaviour as
  // the browser app. Local bundled assets remain available for development.
  ...(process.env.CAPACITOR_SERVER_URL
    ? {
        server: {
          url: process.env.CAPACITOR_SERVER_URL,
          cleartext: process.env.CAPACITOR_SERVER_URL.startsWith('http://'),
        },
      }
    : {}),
};

export default config;
