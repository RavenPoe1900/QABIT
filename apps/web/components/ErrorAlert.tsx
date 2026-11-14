import type { ReactNode } from 'react';
import { WarningIcon } from './icons';

interface Props {
  /** `error`: algo falló. `warning`: hay una duda que el usuario debe resolver (p. ej. creación sin confirmar). */
  tone?: 'error' | 'warning';
  /** Nivel 1: qué ha pasado, en una frase. */
  title: string;
  /** Nivel 2: explicación breve y siguiente paso. Nunca detalles técnicos, trazas ni códigos o números de error. */
  children?: ReactNode;
  /**
   * UNA acción (p. ej. «Reintentar»): en escritorio va a la derecha del mensaje, centrada en vertical;
   * en móvil pasa debajo, alineada con el texto.
   */
  action?: ReactNode;
  /** VARIAS acciones: siempre debajo del texto (a la derecha estrecharían demasiado el mensaje). */
  actions?: ReactNode;
  /**
   * `inline` (por defecto): franja horizontal. `centered`: recuadro compacto con todo apilado y centrado
   * (icono, título, mensaje y acción), para ocupar el centro de un área vacía.
   */
  variant?: 'inline' | 'centered';
}

/**
 * Alerta de error: icono + título + explicación + acciones.
 * `role="alert"` la anuncia a los lectores de pantalla. Se reserva para errores que el usuario debe
 * conocer; la información secundaria usa `role="status"` (cortés) en otros componentes.
 */
export function ErrorAlert({ tone = 'error', title, children, action, actions, variant = 'inline' }: Props) {
  const classes = ['alert', `alert-${tone}`, action && 'alert-has-action', variant === 'centered' && 'alert-centered'];
  return (
    <div className={classes.filter(Boolean).join(' ')} role="alert">
      <WarningIcon className="alert-icon" />
      <div className="alert-content">
        <p className="alert-title">{title}</p>
        {children && <div className="alert-text">{children}</div>}
        {actions && <div className="alert-actions">{actions}</div>}
      </div>
      {action && <div className="alert-action">{action}</div>}
    </div>
  );
}
