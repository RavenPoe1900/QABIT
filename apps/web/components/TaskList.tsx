'use client';

import type { Task, TaskStatus } from '@task-manager/shared';
import { useRef } from 'react';
import { useMinimumVisible } from '../hooks/useMinimumVisible';
import { useVisibleCenter } from '../hooks/useVisibleCenter';
import { isRetryable, type ApiError } from '../lib/api-client';
import { STATUS_LABELS, formatDate, type TaskFilter } from '../lib/labels';
import { ErrorAlert } from './ErrorAlert';
import { RetryIcon } from './icons';
import { Spinner } from './Spinner';
import { TaskActions } from './TaskActions';

interface Props {
  tasks: Task[] | null;
  loading: boolean;
  error: ApiError | null;
  filter: TaskFilter;
  /** Texto del buscador (ya aplicado a `tasks`); solo cambia el mensaje de lista vacía. */
  query: string;
  pendingIds: ReadonlySet<number>;
  actionErrors: Readonly<Record<number, string>>;
  onRetry: () => void;
  onChangeStatus: (id: number, status: TaskStatus) => void;
}

/** Cuatro situaciones distintas: cargando, error, lista vacía y lista con datos. */
export function TaskList({
  tasks,
  loading,
  error,
  filter,
  query,
  pendingIds,
  actionErrors,
  onRetry,
  onChangeStatus,
}: Props) {
  // Recarga con la lista YA visible (la carga inicial y los cambios de filtro usan el área de estado).
  const refreshing = tasks !== null && loading;
  // El indicador se ve al menos 1 s; los datos NO esperan: se pintan en cuanto llegan.
  const showSpinner = useMinimumVisible(refreshing, 1000);
  const table = useRef<HTMLDivElement>(null);
  // Indicador centrado en la parte de la tabla que se ve en pantalla (con muchas filas, el centro de la
  // tabla entera puede quedar fuera de la vista).
  useVisibleCenter(table, showSpinner);

  // Sin datos todavía (cargando o error): la tarjeta conserva la cabecera de la tabla y un área amplia
  // de la MISMA altura en los dos estados, para que no dé saltos al pasar de uno a otro.
  if (tasks === null) {
    return (
      <div className="list-body">
        <TableHead />
        <div className="list-state">
          {error ? (
            <LoadError
              title="No se pudieron cargar las tareas."
              error={error}
              onRetry={onRetry}
              variant="centered"
            />
          ) : (
            <div className="list-loading" role="status">
              <Spinner />
              <p>Cargando tareas…</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="list-body">
      {error && <LoadError title="No se pudo actualizar la lista." error={error} onRetry={onRetry} />}

      {/* Anuncio para lectores de pantalla. La región existe siempre (vacía) para que el cambio se anuncie. */}
      <p className="sr-only" role="status">
        {refreshing ? 'Actualizando…' : ''}
      </p>
      <div ref={table} className={showSpinner ? 'task-table is-refreshing' : 'task-table'}>
      {tasks.length === 0 ? (
        <>
          <TableHead />
          <div className="list-state">
            <p className="empty">
              {query.trim()
                ? `Ninguna tarea coincide con «${query.trim()}».`
                : filter
                  ? `No hay tareas con el estado «${STATUS_LABELS[filter]}».`
                  : 'Todavía no hay tareas. Crea la primera con «Nueva tarea».'}
            </p>
          </div>
        </>
      ) : (
        <>
          <TableHead />
          {/* aria-busy solo mientras la petición está REALMENTE en curso (no durante el segundo mínimo). */}
          <ul className="task-list" aria-label="Lista de tareas" aria-busy={refreshing || undefined}>
            {tasks.map((task) => (
              <li key={task.id} className="task">
                <div className="cell-name">
                  <span className={`dot dot-${task.status}`} aria-hidden="true" />
                  <h3>{task.title}</h3>
                </div>
                <p className="cell-assignee meta">
                  <span className="cell-label">Responsable: </span>
                  {task.assignee}
                </p>
                <p className="cell-date meta">
                  <span className="cell-label">Actualizada: </span>
                  <time dateTime={task.updatedAt}>{formatDate(task.updatedAt)}</time>
                </p>
                <div className="cell-status">
                  <span className={`badge badge-${task.status}`}>
                    <span className="sr-only">Estado: </span>
                    {STATUS_LABELS[task.status]}
                  </span>
                </div>
                <TaskActions
                  task={task}
                  busy={pendingIds.has(task.id)}
                  error={actionErrors[task.id]}
                  locked={refreshing}
                  onChange={onChangeStatus}
                />
              </li>
            ))}
          </ul>
        </>
      )}
        {/* Capa superpuesta: no ocupa espacio (la tabla no se mueve) ni intercepta clics. */}
        <div className={showSpinner ? 'refresh-overlay is-visible' : 'refresh-overlay'} aria-hidden="true">
          <Spinner />
        </div>
      </div>
    </div>
  );
}


/** Cabeceras solo visuales: cada celda de la fila lleva su propia etiqueta accesible. */
function TableHead() {
  return (
    <div className="task-list-head" aria-hidden="true">
      <span>Tarea</span>
      <span>Responsable</span>
      <span>Actualizada</span>
      <span>Estado</span>
      <span>Acciones</span>
    </div>
  );
}

/** Error de carga: «Reintentar» solo si repetir tiene sentido; si no, se ofrece recargar la página. */
function LoadError({
  title,
  error,
  onRetry,
  variant,
}: {
  title: string;
  error: ApiError;
  onRetry: () => void;
  variant?: 'inline' | 'centered';
}) {
  return (
    <ErrorAlert
      variant={variant}
      title={title}
      action={
        isRetryable(error) ? (
          <button type="button" onClick={onRetry}>
            <RetryIcon />
            Reintentar
          </button>
        ) : (
          <button type="button" onClick={() => window.location.reload()}>
            <RetryIcon />
            Recargar la página
          </button>
        )
      }
    >
      <p>{error.message}</p>
    </ErrorAlert>
  );
}
