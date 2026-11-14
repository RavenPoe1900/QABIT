import type { Task } from './task';
import type { TaskStatus } from './task-status';

export interface StatusChange {
  /** `false` si la tarea ya tenía ese estado: no hay nada que guardar. */
  changed: boolean;
  task: Task;
}

/**
 * Regla de negocio (función pura): durante el núcleo se puede pasar a cualquier otro estado
 * válido. Si se pide el estado actual, la tarea se devuelve tal cual, sin tocar `updatedAt`.
 * Solo cuando el estado cambia de verdad, `updatedAt` pasa a ser `now`.
 */
export function applyStatusChange(task: Task, status: TaskStatus, now: Date): StatusChange {
  if (task.status === status) {
    return { changed: false, task };
  }
  return { changed: true, task: { ...task, status, updatedAt: now } };
}
