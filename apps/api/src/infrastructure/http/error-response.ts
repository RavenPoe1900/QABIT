import type { ApiErrorBody, ApiErrorDetail, ErrorCode } from '@task-manager/shared';

/** Construye el cuerpo de error acordado: `{ error: { code, message, details? } }`. */
export function errorBody(
  code: ErrorCode,
  message: string,
  details?: ApiErrorDetail[],
): ApiErrorBody {
  return { error: details ? { code, message, details } : { code, message } };
}

/** Lo mínimo que necesitamos de la respuesta HTTP (evita acoplar el filtro a Express). */
export interface JsonResponse {
  status(code: number): { json(body: unknown): unknown };
}
