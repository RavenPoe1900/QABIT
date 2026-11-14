import type { SchemaObject } from '@nestjs/swagger';
import {
  ASSIGNEE_MAX,
  TITLE_MAX,
  apiErrorSchema,
  createTaskSchema,
  taskSchema,
  updateTaskStatusSchema,
  type ApiErrorBody,
  type Task,
} from '@task-manager/shared';
import { z } from 'zod';

/**
 * Los esquemas del documento OpenAPI se GENERAN desde los esquemas Zod del contrato
 * (`@task-manager/shared`): las reglas no se escriben dos veces.
 *
 * Límites de la generación (comprobados, no supuestos). `z.toJSONSchema` conserva
 * required, additionalProperties:false, minLength/maxLength, enum, rangos y el formato de fecha.
 * NO puede representar, y por tanto no aparecen en el esquema generado:
 *   - `.trim()` de los textos        -> se documenta en la descripción y se prueba por separado.
 *   - los `refine`/`transform` (p. ej. el tope del `id` o el filtro vacío = «todas»)
 *                                    -> `id` y `status` de la URL se escriben a mano con las
 *                                       constantes de shared (ver tasks.api-docs.ts).
 * Se usa `unrepresentable: 'throw'` (valor por defecto): si algún día se añade a un esquema de
 * entrada o salida algo que no se puede representar, la generación FALLA en lugar de perder
 * reglas en silencio. No se usa `unrepresentable: 'any'`.
 */
const OPENAPI = { target: 'openapi-3.0' } as const;

const generate = (schema: z.ZodType, io: 'input' | 'output'): SchemaObject =>
  z.toJSONSchema(schema, { ...OPENAPI, io }) as SchemaObject;

const taskExample: Task = {
  id: 1,
  title: 'Preparar demo',
  assignee: 'Ana',
  status: 'pending',
  createdAt: '2026-11-13T20:40:00.123Z',
  updatedAt: '2026-11-13T20:40:00.123Z',
};

/** Esquemas reutilizables que se publican en `components.schemas`. */
export const openApiSchemas: Record<string, SchemaObject> = {
  Task: {
    ...generate(taskSchema, 'output'),
    description:
      'Una tarea. `createdAt` y `updatedAt` son ISO 8601 en UTC con exactamente tres dígitos de ' +
      'milisegundos. `updatedAt` solo cambia cuando el estado cambia de verdad.',
    example: taskExample,
  },
  CreateTaskRequest: {
    ...generate(createTaskSchema, 'input'),
    description:
      `Datos para crear una tarea. Los espacios al inicio y al final de \`title\` y \`assignee\` se ` +
      `recortan ANTES de validar la longitud (el recorte no es representable en JSON Schema). ` +
      `Longitud tras recortar: title 1–${TITLE_MAX}, assignee 1–${ASSIGNEE_MAX} puntos de código (un emoji cuenta 1). ` +
      `No pueden contener caracteres de control (U+0000–U+001F y U+007F–U+009F). ` +
      `Cualquier otro campo, incluido \`status\`, se rechaza con 400: las tareas siempre se crean como \`pending\`.`,
    example: { title: 'Preparar demo', assignee: 'Ana' },
  },
  UpdateTaskStatusRequest: {
    ...generate(updateTaskStatusSchema, 'input'),
    description:
      'Nuevo estado. Durante el núcleo se admite cualquier estado válido. Cualquier otro campo se rechaza con 400.',
    example: { status: 'in_progress' },
  },
  ApiError: {
    ...generate(apiErrorSchema, 'output'),
    description:
      'Formato de TODOS los errores. `details` solo aparece en los errores de validación; `path` es el ' +
      'nombre del campo, o `(body)`, `(query)` o `id` cuando el problema afecta a todo el valor.',
  },
};

export type OpenApiSchemaName = 'Task' | 'CreateTaskRequest' | 'UpdateTaskStatusRequest' | 'ApiError';

export const schemaRef = (name: OpenApiSchemaName) => ({ $ref: `#/components/schemas/${name}` });

/** Ejemplo de cuerpo de error, tipado con el contrato compartido. */
export const errorExample = (
  summary: string,
  error: ApiErrorBody['error'],
): { summary: string; value: ApiErrorBody } => ({ summary, value: { error } });
