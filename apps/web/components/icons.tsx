/**
 * Iconos SVG de la interfaz. Todos son decorativos (`aria-hidden`): el significado lo dan siempre el
 * texto visible o el nombre accesible del control que los contiene. El tamaño y el trazo los fija el
 * CSS del contexto (salvo `PlusIcon`, que los lleva en línea).
 */

export function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3.2 18 17H2L10 3.2Z" />
      <path d="M10 8.5v3.8M10 14.6v.01" />
    </svg>
  );
}

/** Flecha circular pequeña que acompaña al texto de «Reintentar» o «Recargar la página». */
export function RetryIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.5v3h-3" />
    </svg>
  );
}
