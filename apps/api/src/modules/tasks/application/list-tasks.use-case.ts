import type { Task } from '../domain/task';
import type { TaskStatus } from '../domain/task-status';
import type { TaskRepository } from './ports/task-repository.port';

export class ListTasksUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  execute(filter: { status?: TaskStatus }): Promise<Task[]> {
    return this.tasks.list(filter);
  }
}
