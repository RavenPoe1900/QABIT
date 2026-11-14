import type { Clock } from '../../../shared-kernel/clock';
import type { Task } from '../domain/task';
import { ConcurrentTaskUpdateError, TaskNotFoundError } from '../domain/task-errors';
import type { TaskStatus } from '../domain/task-status';
import { applyStatusChange } from '../domain/task-status-change';
import type { TaskRepository } from './ports/task-repository.port';

/** Reintentos si otra petición cambia la tarea entre la lectura y la escritura. */
export const MAX_STATUS_UPDATE_ATTEMPTS = 3;

export class ChangeTaskStatusUseCase {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Lee la tarea, aplica la regla de dominio y escribe SOLO si el estado sigue siendo el leído
   * (actualización condicional). Si otro cambio se coló entre medias, vuelve a leer y a decidir
   * sobre el estado nuevo, como si las peticiones hubieran llegado una detrás de otra. Así nunca
   * se decide sobre un estado obsoleto (p. ej. no se reescribe `updatedAt` de una tarea que ya
   * estaba en el estado pedido).
   *
   * Lanza errores de DOMINIO, nunca excepciones HTTP: `TaskNotFoundError` si no existe y
   * `ConcurrentTaskUpdateError` si se agotan los reintentos.
   */
  async execute(id: number, status: TaskStatus): Promise<Task> {
    for (let attempt = 1; attempt <= MAX_STATUS_UPDATE_ATTEMPTS; attempt++) {
      const current = await this.tasks.findById(id);
      if (!current) {
        throw new TaskNotFoundError(id);
      }

      const { changed, task: next } = applyStatusChange(current, status, this.clock.now());
      if (!changed) {
        return current;
      }

      const saved = await this.tasks.updateStatusIfUnchanged(id, current.status, status, next.updatedAt);
      if (saved) {
        return saved;
      }
      // La tarea cambió (o desapareció) entre la lectura y la escritura: se relee y se decide de nuevo.
    }
    throw new ConcurrentTaskUpdateError(id);
  }
}
