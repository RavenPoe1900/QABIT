'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface DropdownMenuItem {
  /** Clave estable de la opción. */
  id: string;
  /** Contenido de la opción (debe dar un nombre accesible claro). */
  content: ReactNode;
  /** Clase extra de la opción (se añade a `menu-item`). */
  className?: string;
  onSelect: () => void;
}

interface Props {
  /** Contenido del botón que abre el menú (texto visible, texto para lectores, icono…). */
  trigger: ReactNode;
  /** Nombre accesible de la lista de opciones. */
  menuLabel: string;
  items: DropdownMenuItem[];
  /** Clase del contenedor. */
  className?: string;
  /** Deshabilitado de verdad (`disabled`): no recibe foco. */
  disabled?: boolean;
  /**
   * Bloqueado temporalmente (`aria-disabled`): sigue pudiendo tener el foco, pero no abre el menú. Si se
   * bloquea con el menú abierto, el menú se cierra.
   */
  locked?: boolean;
}

/**
 * Botón con menú desplegable (patrón «menu button»).
 * Teclado: Enter/Espacio/↓ abren y van a la primera opción, ↑ a la última; ↑ ↓ Inicio Fin se mueven
 * (circular); Escape cierra y devuelve el foco al botón; Tab cierra; un clic fuera también cierra.
 * Si queda poco sitio debajo, el menú se abre hacia arriba.
 */
export function DropdownMenu({ trigger, menuLabel, items, className, disabled = false, locked = false }: Props) {
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<'first' | 'last'>('first');
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);

  const menuItems = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  function openMenu(focus: 'first' | 'last') {
    initialFocus.current = focus;
    const rect = button.current?.getBoundingClientRect();
    setOpenUp(rect !== undefined && window.innerHeight - rect.bottom < 180 && rect.top > 180);
    setOpen(true);
  }

  function closeMenu(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  // Al abrir, el foco va a una opción; mientras está abierto, un clic fuera cierra el menú.
  useEffect(() => {
    if (!open) return;
    const list = menuItems();
    (initialFocus.current === 'last' ? list[list.length - 1] : list[0])?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (locked) setOpen(false);
  }, [locked]);

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (locked) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(event.key === 'ArrowUp' ? 'last' : 'first');
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = menuItems();
    const index = list.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = (index + 1) % list.length; // circular
    else if (event.key === 'ArrowUp') next = (index - 1 + list.length) % list.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = list.length - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    } else if (event.key === 'Tab') {
      closeMenu(true); // el foco vuelve al botón y Tab continúa desde ahí
      return;
    }
    if (next !== null) {
      event.preventDefault();
      list[next]?.focus();
    }
  }

  return (
    <div ref={root} className={className}>
      <button
        ref={button}
        type="button"
        className="secondary menu-trigger"
        disabled={disabled}
        aria-disabled={locked || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (locked) return;
          if (open) closeMenu(false);
          else openMenu('first');
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          className={openUp ? 'menu menu-up' : 'menu'}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={item.className ? `menu-item ${item.className}` : 'menu-item'}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.content}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
