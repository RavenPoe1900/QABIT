import type { NextConfig } from 'next';

// El navegador solo llama a /api/* en su propio origen; el servidor de Next es quien
// necesita conocer el destino. Next evalúa los rewrites al compilar (next build), así
// que API_URL debe estar definida en ese momento. El comportamiento exacto con
// `next dev` y con `next build` + `next start` se comprueba y se documenta en el README.
const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // `next dev` genera por su cuenta un AGENTS.md en esta carpeta; no forma parte de la prueba.
  agentRules: false,
  // Solo afecta a `next dev`: Next 16 bloquea los recursos de desarrollo (HMR…) si la página se abre desde un
  // host distinto de `localhost`, y la app se queda en «Cargando tareas…» sin hidratar. La API y las pruebas
  // E2E usan 127.0.0.1, así que se admite también. En producción (`next start`) no tiene ningún efecto.
  allowedDevOrigins: ['127.0.0.1'],
  // Cabeceras básicas. Sin CSP a propósito: una política compleja sin probar podría romper la app.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
