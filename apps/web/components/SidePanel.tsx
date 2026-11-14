'use client';

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { CloseIcon } from './icons';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Título visible; también es el nombre accesible del diálogo. */
  title: string;
  /** Texto breve bajo el título. */
  description?: ReactNode;
  /** Nombre accesible del botón de cerrar. */
  closeLabel?: string;
  children: ReactNode;
}

/**
 * Panel lateral modal. Los hijos se mantienen SIEMPRE montados (cerrado = `inert` + oculto con CSS),
 * así lo que contengan (p. ej. un borrador) sobrevive a cerrar el panel.
 * Al abrir, el foco va al primer campo; Escape y el fondo cierran; Tab no sale del panel.
 */
export function SidePanel({ open, onClose, title, description, closeLabel = 'Cerrar panel', children }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const trapTab = useFocusTrap(panel, open);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    trapTab(event);
  }

  return (
    <div className={open ? 'panel-layer is-open' : 'panel-layer'} inert={!open}>
      <div className="panel-backdrop" aria-hidden="true" onClick={onClose} />
      <aside
        ref={panel}
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <header className="panel-head">
          <div className="panel-head-row">
            <h2 id={titleId} className="panel-title">
              {title}
            </h2>
            <button type="button" className="secondary panel-close" onClick={onClose} aria-label={closeLabel}>
              <CloseIcon />
            </button>
          </div>
          {description && <p className="panel-desc">{description}</p>}
        </header>
        {children}
      </aside>
    </div>
  );
}
