'use client';

import { useLayoutEffect, type RefObject } from 'react';

/**
 * Mientras `enabled` sea true, escribe en el elemento una variable CSS (por defecto `--spinner-y`) con la
 * distancia, en px desde su borde superior, al centro de la parte del elemento que se ve en pantalla.
 * Sirve para centrar algo superpuesto en lo visible de un elemento más alto que la ventana.
 * Escribe la variable directamente en el DOM: hacer scroll no provoca renders.
 */
export function useVisibleCenter(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  cssVar = '--spinner-y',
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const top = Math.max(rect.top, 0);
      const bottom = Math.min(rect.bottom, window.innerHeight);
      const y = bottom > top ? (top + bottom) / 2 - rect.top : rect.height / 2;
      el.style.setProperty(cssVar, `${Math.round(y)}px`);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref, enabled, cssVar]);
}
