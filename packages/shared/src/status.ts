import { z } from 'zod';

/** Valores internos del contrato. La interfaz los muestra en español, pero no los cambia. */
export const TASK_STATUSES = ['pending', 'in_progress', 'done'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const taskStatusSchema = z.enum(TASK_STATUSES, { error: 'Estado no válido' });
