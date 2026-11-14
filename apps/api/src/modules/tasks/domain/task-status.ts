/**
 * Estados de una tarea según el DOMINIO. El dominio es dueño de su vocabulario y no depende del
 * contrato HTTP (`@task-manager/shared`). El contrato declara los mismos valores; un test de
 * paridad (test/contract-parity.test.ts) falla si alguna vez divergen.
 */
export const TASK_STATUSES = ['pending', 'in_progress', 'done'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Regla de negocio: toda tarea nace pendiente. */
export const INITIAL_TASK_STATUS: TaskStatus = 'pending';

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}
