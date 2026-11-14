import type { TaskStatus } from '@task-manager/shared';

/** Etiquetas en español. Los valores internos del contrato (pending, in_progress, done) no cambian. */
export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  done: 'Hecha',
};

/** Filtro de la lista: cadena vacía = todas las tareas. */
export type TaskFilter = '' | TaskStatus;

/** Las fechas llegan en ISO UTC; se muestran en la zona horaria del navegador. */
const dateFormat = (): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' });

export function formatDate(iso: string): string {
  return dateFormat().format(new Date(iso));
}
