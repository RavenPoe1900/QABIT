'use client';

import { useCallback, useEffect, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportamiento de foco de una ventana modal mientras `active` sea true:
 * - al activarse, lleva el foco al primer campo de texto (o, si no hay, al primer control);
 * - bloquea el scroll de la página de fondo;
 * - devuelve un manejador de teclado que impide que Tab / Mayús+Tab salgan del contenedor.
 * Devolver el foco al cerrar lo decide quien abre la ventana (sabe qué botón la abrió).
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    (el.querySelector<HTMLElement>('input') ?? el.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [ref, active]);

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const el = ref.current;
      if (event.key !== 'Tab' || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [ref],
  );
}
