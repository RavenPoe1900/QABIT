import type { TaskRepository } from '../../src/modules/tasks/application/ports/task-repository.port';
import type { NewTask, Task } from '../../src/modules/tasks/domain/task';
import type { TaskStatus } from '../../src/modules/tasks/domain/task-status';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export interface Gate {
  /** Se resuelve cuando la petición congelada ya ha LEÍDO la tarea. */
  reached: Promise<void>;
  /** Deja continuar a la petición congelada. */
  release: () => void;
}

/**
 * Envoltorio de un repositorio real que puede congelar UNA petición justo después de leer la
 * tarea. Permite reproducir de forma determinista que otra petición la cambie entre la lectura y
 * la escritura, sin depender de la suerte con los tiempos.
 */
export class GatedRepository implements TaskRepository {
  private armed?: { reached: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> };

  constructor(private readonly inner: TaskRepository) {}

  arm(): Gate {
    const gate = { reached: deferred(), release: deferred() };
    this.armed = gate;
    return { reached: gate.reached.promise, release: gate.release.resolve };
  }

  list(filter: { status?: TaskStatus }): Promise<Task[]> {
    return this.inner.list(filter);
  }

  create(task: NewTask): Promise<Task> {
    return this.inner.create(task);
  }

  updateStatusIfUnchanged(id: number, expected: TaskStatus, next: TaskStatus, updatedAt: Date) {
    return this.inner.updateStatusIfUnchanged(id, expected, next, updatedAt);
  }

  async findById(id: number): Promise<Task | null> {
    const task = await this.inner.findById(id);
    const gate = this.armed;
    if (gate) {
      this.armed = undefined; // solo la primera lectura tras armar se congela
      gate.reached.resolve();
      await gate.release.promise;
    }
    return task;
  }
}
