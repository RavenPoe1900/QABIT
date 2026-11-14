import { DomainError } from '../../../shared-kernel/domain-error';

/** La tarea pedida no existe. */
export class TaskNotFoundError extends DomainError {
  constructor(public readonly taskId: number) {
    super('Tarea no encontrada');
  }
}

export interface TaskValidationProblem {
  field: 'title' | 'assignee';
  message: string;
}

/** Los datos no cumplen las invariantes de una tarea. */
export class TaskValidationError extends DomainError {
  constructor(public readonly problems: readonly TaskValidationProblem[]) {
    super('Datos de la tarea no válidos');
  }
}

/**
 * La tarea siguió cambiando por otras peticiones mientras se intentaba actualizar su estado,
 * y se agotaron los reintentos.
 */
export class ConcurrentTaskUpdateError extends DomainError {
  constructor(public readonly taskId: number) {
    super('La tarea cambió mientras se actualizaba');
  }
}
