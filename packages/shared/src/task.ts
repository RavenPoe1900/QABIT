import { z } from 'zod';
import { isoUtcMillisSchema } from './datetime.js';
import { ID_MAX } from './limits.js';
import { taskStatusSchema } from './status.js';

/**
 * Tarea tal como la devuelve la API. El frontend valida con este esquema cada respuesta.
 * No es estricto a propósito: un campo nuevo en el futuro no debe romper a un cliente antiguo.
 */
export const taskSchema = z.object({
  id: z.number().int().positive().max(ID_MAX),
  title: z.string(),
  assignee: z.string(),
  status: taskStatusSchema,
  createdAt: isoUtcMillisSchema,
  updatedAt: isoUtcMillisSchema,
});

export const taskListSchema = z.array(taskSchema);

export type Task = z.infer<typeof taskSchema>;
