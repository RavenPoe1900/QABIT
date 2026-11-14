'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Indicador visible durante al menos `minMs` desde que aparece.
 *
 * - `active` pasa a true → visible AL INSTANTE (en el mismo render, sin esperar a un efecto).
 * - `active` pasa a false antes de `minMs` → sigue visible hasta completar `minMs` desde que apareció.
 * - `active` dura más que `minMs` → se oculta en cuanto pasa a false.
 * - Si `active` vuelve a true mientras aún se ve, sigue visible sin reiniciar la cuenta.
 *
 * Solo afecta a la PRESENTACIÓN: quien llama no espera a nada; los datos se actualizan cuando llegan.
 */
export function useMinimumVisible(active: boolean, minMs = 1000): boolean {
  const [lingering, setLingering] = useState(false);
  const shownAt = useRef<number | null>(null);

  // La cuenta empieza cuando el indicador se PINTA (layout effect, justo antes de dibujar el fotograma),
  // no cuando se calcula el render: así el segundo mínimo es el que de verdad ve el usuario.
  useLayoutEffect(() => {
    if (active && shownAt.current === null) shownAt.current = Date.now();
  }, [active]);

  useEffect(() => {
    if (active) {
      setLingering(true);
      return;
    }
    if (shownAt.current === null) return;
    const remaining = Math.max(0, minMs - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      shownAt.current = null;
      setLingering(false);
    }, remaining);
    return () => clearTimeout(timer);
  }, [active, minMs]);

  return active || lingering;
}
