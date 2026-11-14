/**
 * Indicador de carga circular (decorativo). El estado se comunica aparte, con texto o con una región
 * `role="status"`. Con movimiento reducido no gira (lo decide el CSS).
 * - `md`: carga de la lista y recarga superpuesta.
 * - `sm`: dentro de un botón, ocupando el sitio de un icono.
 */
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return <span className={size === 'sm' ? 'spinner spinner-sm' : 'spinner'} aria-hidden="true" />;
}
