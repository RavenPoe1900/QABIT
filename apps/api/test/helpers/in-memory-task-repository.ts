import type { TaskRepository } from '../../src/modules/tasks/application/ports/task-repository.port';
import type { NewTask, Task } from '../../src/modules/tasks/domain/task';
import type { TaskStatus } from '../../src/modules/tasks/domain/task-status';

/**
 * Repositorio en memoria para probar los casos de uso sin base de datos. Igual que el adaptador
 * real, guarda lo que recibe del dominio y NO decide ninguna regla de negocio (ni el estado inicial).
 */
export class InMemoryTaskRepository implements TaskRepository {
  readonly tasks: Task[] = [];
  updateCalls = 0;
  private nextId = 1;

  async list(filter: { status?: TaskStatus }): Promise<Task[]> {
    return this.tasks.filter((t) => !filter.status || t.status === filter.status);
  }

  async findById(id: number): Promise<Task | null> {
    const task = this.tasks.find((t) => t.id === id);
    return task ? { ...task } : null;
  }

  async create(task: NewTask): Promise<Task> {
    const saved: Task = { id: this.nextId++, ...task };
    this.tasks.push(saved);
    return { ...saved };
  }

  async updateStatusIfUnchanged(
    id: number,
    expected: TaskStatus,
    next: TaskStatus,
    updatedAt: Date,
  ): Promise<Task | null> {
    this.updateCalls++;
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index === -1 || this.tasks[index].status !== expected) return null; // misma semántica que el adaptador real
    this.tasks[index] = { ...this.tasks[index], status: next, updatedAt };
    return { ...this.tasks[index] };
  }

  /** Simula que OTRA petición cambia la tarea directamente (para los tests de concurrencia). */
  forceStatus(id: number, status: TaskStatus, updatedAt: Date): void {
    const index = this.tasks.findIndex((t) => t.id === id);
    this.tasks[index] = { ...this.tasks[index], status, updatedAt };
  }
}
