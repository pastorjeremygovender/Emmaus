import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@admin-route': path.resolve(
        import.meta.dirname,
        process.env.VITE_EMMAUS_BUILD_TARGET === 'member'
          ? 'src/routes/AdminRoute.member.tsx'
          : 'src/routes/AdminRoute.web.tsx',
      ),
    },
  },
});
