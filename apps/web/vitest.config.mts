import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Zona horaria fija para que ningún test dependa de la máquina donde se ejecuta.
process.env.TZ = 'UTC';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    css: false,
  },
});
