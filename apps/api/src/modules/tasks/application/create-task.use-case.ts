import type { Clock } from '../../../shared-kernel/clock';
import { createNewTask, type NewTaskInput } from '../domain/new-task';
import type { Task } from '../domain/task';
import type { TaskRepository } from './ports/task-repository.port';

export class CreateTaskUseCase {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Rechaza con `TaskValidationError` (error de dominio) si los datos no cumplen las invariantes.
   * Es `async` a propósito: el error SIEMPRE llega como promesa rechazada, nunca como excepción
   * síncrona, igual que cualquier otro fallo del caso de uso.
   */
  async execute(input: NewTaskInput): Promise<Task> {
    // Las reglas (recorte, longitudes, estado inicial «pending», fechas) las aplica el dominio.
    const task = createNewTask(input, this.clock.now());
    return this.tasks.create(task);
  }
}
