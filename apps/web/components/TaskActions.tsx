'use client';

import { TASK_STATUSES, type Task, type TaskStatus } from '@task-manager/shared';
import { STATUS_LABELS } from '../lib/labels';
import { DropdownMenu } from './DropdownMenu';
import { ChevronDownIcon } from './icons';
import { Spinner } from './Spinner';

interface Props {
  task: Task;
  busy: boolean;
  error?: string;
  onChange: (id: number, status: TaskStatus) => void;
  /**
   * La lista se está recargando: el estado que se ve puede estar desactualizado, así que no se permite
   * cambiarlo hasta tener los datos nuevos (sin quitar el foco al botón).
   */
  locked?: boolean;
}

/**
 * Cambio de estado de una tarea: un menú «Cambiar» con una opción por cada estado distinto del actual
 * (durante el núcleo se admite cualquier cambio). El comportamiento del menú vive en `DropdownMenu`.
 */
export function TaskActions({ task, busy, error, onChange, locked = false }: Props) {
  const items = TASK_STATUSES.filter((status) => status !== task.status).map((status) => ({
    id: status,
    className: `menu-item-${status}`,
    onSelect: () => onChange(task.id, status),
    content: (
      <>
        <span className={`dot dot-${status}`} aria-hidden="true" />
        <span className="sr-only">Marcar como</span> {STATUS_LABELS[status]}{' '}
        {/* El espacio va FUERA del span: al calcular el nombre se recorta el espacio inicial de un elemento. */}
        <span className="sr-only">la tarea «{task.title}»</span>
      </>
    ),
  }));

  return (
    <div className="task-actions">
      <DropdownMenu
        className="actions status-menu"
        menuLabel={`Cambiar el estado de «${task.title}»`}
        items={items}
        disabled={busy}
        locked={locked}
        trigger={
          <>
            Cambiar{' '}
            {/* El texto visible («Cambiar») está contenido en el nombre accesible (WCAG 2.5.3). */}
            <span className="sr-only">estado de la tarea «{task.title}»</span>
            {/* Mientras guarda, un indicador pequeño ocupa el sitio de la flecha: la fila no cambia de alto. */}
            {busy ? <Spinner size="sm" /> : <ChevronDownIcon className="chevron" />}
          </>
        }
      />
      {/* «Guardando…» se anuncia a los lectores de pantalla sin ocupar espacio (antes añadía una línea a la
          fila y la hacía crecer y encoger). Va fuera de .task-feedback para que esa zona siga vacía. */}
      {busy && (
        <p className="sr-only" role="status">
          Guardando…
        </p>
      )}
      <div className="task-feedback">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
