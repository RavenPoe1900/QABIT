'use client'; // Los límites de error deben ser componentes de cliente.

import { useEffect } from 'react';
import { ErrorAlert } from '../components/ErrorAlert';
import { RetryIcon } from '../components/icons';

/**
 * Fallo inesperado del frontend (un error al pintar). No se enseña el mensaje, la traza ni ningún código:
 * se registra en la consola y al usuario se le ofrece reintentar o recargar la página.
 */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container">
      <ErrorAlert
        title="Algo ha salido mal en la aplicación."
        actions={
          <>
            <button type="button" onClick={() => retry()}>
              <RetryIcon />
              Reintentar
            </button>
            <button type="button" className="secondary" onClick={() => window.location.reload()}>
              Recargar la página
            </button>
          </>
        }
      >
        <p>Ha ocurrido un problema inesperado. Prueba a reintentar; si sigue pasando, recarga la página.</p>
      </ErrorAlert>
    </main>
  );
}
