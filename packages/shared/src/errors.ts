import { z } from 'zod';

/**
 * TODOS los códigos que esta API puede emitir (un test comprueba que ninguno falta). Los tres últimos
 * antes de INTERNAL_ERROR son genéricos: los emite el filtro global para cualquier HttpException 4xx
 * que no tenga un código propio (p. ej. un método no permitido).
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_JSON',
  'TASK_NOT_FOUND',
  'ROUTE_NOT_FOUND',
  'CONCURRENT_UPDATE',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'BAD_REQUEST',
  'METHOD_NOT_ALLOWED',
  'HTTP_ERROR',
  'INTERNAL_ERROR',
] as const;

/** Mensajes que la API repite en varios sitios (respuestas reales y documentación OpenAPI). */
export const ERROR_MESSAGES = {
  validation: 'Datos inválidos',
  routeNotFound: 'Ruta no encontrada',
  concurrentUpdate: 'La tarea cambió mientras se actualizaba. Vuelve a cargarla e inténtalo de nuevo.',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});

/**
 * Forma de todos los errores: `{ error: { code, message, details? } }`.
 * `code` es un string libre a propósito: la API puede emitir además códigos genéricos
 * (por ejemplo PAYLOAD_TOO_LARGE para un 413) y el cliente no debe romperse por ello.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
  }),
});

export type ApiErrorDetail = z.infer<typeof errorDetailSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

/**
 * Convierte los problemas de Zod al formato `details` del contrato. Lo usan tanto la API
 * (para construir la respuesta 400) como el formulario (para mostrar errores por campo).
 * `path` vale `"title"`, `"assignee"`… o `"(body)"` cuando el problema afecta al objeto entero.
 */
export function issuesToDetails(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): ApiErrorDetail[] {
  return issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.map(String).join('.') : '(body)',
    message: issue.message,
  }));
}
