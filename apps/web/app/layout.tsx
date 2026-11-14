import type { ReactNode } from 'react';

export const metadata = {
  title: 'Gestor de tareas',
  description: 'Prueba técnica: gestor de tareas con NestJS y Next.js',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
