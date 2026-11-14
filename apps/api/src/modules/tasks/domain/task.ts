import type { TaskStatus } from './task-status';

/** Entidad de dominio. Las fechas son `Date`; el adaptador HTTP las convierte a ISO. */
export interface Task {
  id: number;
  title: string;
  assignee: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tarea lista para guardarse (todavía sin `id`). Se obtiene con `createNewTask`, que aplica las
 * invariantes y fija el estado inicial: la persistencia guarda lo que recibe, sin decidir reglas.
 */
export interface NewTask {
  title: string;
  assignee: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}
