'use client'; // Los límites de error deben ser componentes de cliente.

import { useEffect } from 'react';
import { ErrorAlert } from '../components/ErrorAlert';
import { RetryIcon } from '../components/icons';
import './globals.css';

/** Último recurso: falla el propio layout raíz. Define su `<html>` y `<body>` porque sustituye al layout. */
export default function GlobalError({ error }: { error: unknown }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <main className="container">
          <ErrorAlert
            title="No se pudo mostrar la aplicación."
            action={
              <button type="button" onClick={() => window.location.reload()}>
                <RetryIcon />
                Recargar la página
              </button>
            }
          >
            <p>Ha ocurrido un problema inesperado. Recarga la página para volver a intentarlo.</p>
          </ErrorAlert>
        </main>
      </body>
    </html>
  );
}
