import type { Task as TaskDto } from '@task-manager/shared';
import type { Task } from '../../domain/task';

/** Dominio (Date) → contrato JSON (ISO 8601 UTC con exactamente 3 decimales). */
export function presentTask(task: Task): TaskDto {
  return {
    id: task.id,
    title: task.title,
    assignee: task.assignee,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
