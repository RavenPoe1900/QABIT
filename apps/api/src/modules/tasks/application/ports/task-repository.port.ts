import type { NewTask, Task } from '../../domain/task';
import type { TaskStatus } from '../../domain/task-status';

/**
 * Puerto de persistencia. La aplicación depende de esta interfaz; el adaptador Prisma la
 * implementa. Así los casos de uso se prueban sin base de datos.
 */
export interface TaskRepository {
  /** Más recientes primero: `createdAt` descendente y, en empate, `id` descendente. */
  list(filter: { status?: TaskStatus }): Promise<Task[]>;

  findById(id: number): Promise<Task | null>;

  /** Guarda la tarea tal cual la construyó el dominio (incluido su estado) y le asigna `id`. */
  create(task: NewTask): Promise<Task>;

  /**
   * Actualización CONDICIONAL y atómica: cambia el estado solo si en ese instante sigue siendo
   * `expected`. Devuelve `null` si la tarea ya no existe o si otro cambio se coló entre la
   * lectura y la escritura (en ese caso no escribe nada).
   */
  updateStatusIfUnchanged(
    id: number,
    expected: TaskStatus,
    next: TaskStatus,
    updatedAt: Date,
  ): Promise<Task | null>;
}

export const TASK_REPOSITORY = Symbol('TASK_REPOSITORY');
