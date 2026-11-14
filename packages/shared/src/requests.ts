import { z } from 'zod';
import { ASSIGNEE_MAX, ID_MAX, TITLE_MAX } from './limits.js';
import { type Task } from './task.js';
import { taskStatusSchema } from './status.js';

/**
 * Mensajes en español para los problemas que afectan al objeto entero (cuerpo o query):
 * campos no previstos y un valor que no es un objeto (cuerpo ausente, `null`, array, texto…,
 * por ejemplo al enviar `Content-Type: text/plain`).
 */
const strictOptions = {
  error: (issue: { code: string; keys?: string[] }) => {
    if (issue.code === 'unrecognized_keys') {
      return `Campos no permitidos: ${(issue.keys ?? []).join(', ')}`;
    }
    if (issue.code === 'invalid_type') {
      return 'Se esperaba un objeto JSON';
    }
    return undefined;
  },
};

/**
 * Caracteres de control (U+0000–U+001F y U+007F–U+009F). Se rechazan porque SQLite deja de contar
 * en el primer NUL: un título como «\u0000abc» pasaría la validación y fallaría el CHECK de la base
 * (un 500 en lugar de un 400).
 */
const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001F\u007F-\u009F]*$/;

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} es obligatorio` })
    .trim()
    .min(1, `${label} es obligatorio`)
    .max(max, `${label} admite como máximo ${max} caracteres`)
    .regex(NO_CONTROL_CHARACTERS, `${label} no puede contener caracteres de control`);

/**
 * POST /api/tasks. Estricto: cualquier otra clave (incluido `status`) es un error 400,
 * porque las tareas siempre se crean como `pending`.
 */
export const createTaskSchema = z.strictObject(
  {
    title: requiredText('El título', TITLE_MAX),
    assignee: requiredText('El responsable', ASSIGNEE_MAX),
  },
  strictOptions,
);

/** PATCH /api/tasks/:id/status. Estricto. */
export const updateTaskStatusSchema = z.strictObject(
  { status: taskStatusSchema },
  strictOptions,
);

/**
 * GET /api/tasks?status=…  Sin `status` o con `status=` vacío equivale a «todas».
 * Un valor desconocido, un parámetro repetido (llega como array) o cualquier otro
 * parámetro de la query es un error 400.
 */
export const listTasksQuerySchema = z
  .strictObject(
    {
      status: z
        .union([z.literal(''), taskStatusSchema], { error: 'Estado no válido' })
        .optional(),
    },
    strictOptions,
  )
  .transform((query) => ({ status: query.status || undefined }));

/** Parámetro :id de la ruta: solo dígitos, sin signo ni ceros a la izquierda, hasta ID_MAX. */
export const taskIdParamSchema = z
  .string({ error: 'Identificador no válido' })
  .regex(/^[1-9]\d*$/, 'Identificador no válido')
  .transform(Number)
  .refine((id) => id <= ID_MAX, 'Identificador no válido');

export type CreateTaskRequest = z.input<typeof createTaskSchema>;
export type CreateTaskInput = z.output<typeof createTaskSchema>;
export type UpdateTaskStatusRequest = z.infer<typeof updateTaskStatusSchema>;
export type ListTasksQuery = z.output<typeof listTasksQuerySchema>;

/** GET /api/tasks devuelve directamente un array (no hay paginación). */
export type ListTasksResponse = Task[];
export type CreateTaskResponse = Task;
export type UpdateTaskStatusResponse = Task;
