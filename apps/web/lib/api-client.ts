import {
  apiErrorSchema,
  taskListSchema,
  taskSchema,
  type ApiErrorDetail,
  type CreateTaskRequest,
  type Task,
  type TaskStatus,
  type UpdateTaskStatusRequest,
} from '@task-manager/shared';

/**
 * Cliente HTTP: único sitio que conoce las rutas de la API y que traduce los fallos a
 * `ApiError`. Las URLs son SIEMPRE relativas (`/api/...`): en el navegador no existe ninguna
 * dirección interna de la API; el rewrite de Next (next.config.ts) la reenvía.
 *
 * Qué se valida en ejecución y qué solo está tipado:
 *  - Validado: la forma de CADA respuesta correcta (taskSchema / taskListSchema) y la de los
 *    errores (apiErrorSchema). Una respuesta que no cumple el contrato nunca se pinta.
 *  - Solo tipos TypeScript: los argumentos que reciben estas funciones.
 */

export type ApiErrorKind =
  /** 400 con el formato de error acordado. */
  | 'validation'
  /** 404 con el formato de error acordado. */
  | 'not_found'
  /** 409 con el formato de error acordado: la tarea cambió por otra petición y NO se aplicó el cambio. */
  | 'conflict'
  /** 413 o 415 con el formato de error acordado: el servidor rechazó el cuerpo. */
  | 'rejected'
  /** 5xx con el formato de error acordado. */
  | 'server'
  /** `fetch` lanzó una excepción: no hubo respuesta. */
  | 'network'
  /** Llegó una respuesta pero no se pudo leer su cuerpo. */
  | 'unreadable'
  /** Cualquier otra cosa: cuerpo que no es JSON, que no cumple el contrato, estado imprevisto… */
  | 'unexpected';

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const MESSAGES = {
  // Lenguaje llano y sin atribuir causas que no se pueden verificar (p. ej. «la API está caída»).
  network: 'No hemos podido conectar. Comprueba tu conexión a internet e inténtalo de nuevo.',
  unreadable: 'Recibimos una respuesta que no hemos podido leer. Inténtalo de nuevo en unos minutos.',
  badShape: 'Recibimos una respuesta que no hemos podido entender. Inténtalo de nuevo en unos minutos.',
  server: 'Algo ha fallado de nuestro lado. Inténtalo de nuevo en unos minutos.',
  // Sin el código HTTP: al usuario no se le muestran números de error (el estado queda en `ApiError.status`).
  unexpected: 'Algo ha salido mal. Inténtalo de nuevo en unos minutos.',
  generic: 'Algo ha salido mal. Inténtalo de nuevo en unos minutos.',
} as const;

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 400) return 'validation';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 413 || status === 415) return 'rejected';
  if (status >= 500) return 'server';
  return 'unexpected';
}

async function request<T>(path: string, init: RequestInit, parser: Parser<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError('network', MESSAGES.network);
  }

  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError('unreadable', MESSAGES.unreadable, response.status);
  }
  const body = parseJson(text);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('unexpected', MESSAGES.unexpected, response.status);
    }
    const { code, message, details } = parsed.data.error;
    const kind = kindForStatus(response.status);
    // Los mensajes de un 5xx son técnicos («Error interno del servidor»): al usuario se le da uno llano.
    throw new ApiError(kind, kind === 'server' ? MESSAGES.server : message, response.status, code, details ?? []);
  }

  const result = parser.safeParse(body);
  if (!result.success) {
    throw new ApiError('unexpected', MESSAGES.badShape, response.status);
  }
  return result.data;
}

/** Cualquier error que no sea de la API (un bug) se presenta como inesperado. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError('unexpected', MESSAGES.generic);
}

/**
 * ¿El contrato del servidor GARANTIZA que una creación rechazada con este error no guardó nada?
 * Solo los rechazos que ocurren antes de escribir: 400 VALIDATION_ERROR / INVALID_JSON, 413
 * PAYLOAD_TOO_LARGE y 415 UNSUPPORTED_MEDIA_TYPE, y solo si el cuerpo cumple el formato de
 * error. Cualquier otro resultado (404, 5xx, cuerpo ilegible, fallo de red, 201 con cuerpo
 * inválido…) deja la creación SIN CONFIRMAR: la tarea pudo guardarse.
 */
export function isSafeRejection(error: ApiError): boolean {
  switch (error.status) {
    case 400:
      return error.code === 'VALIDATION_ERROR' || error.code === 'INVALID_JSON';
    case 413:
      return error.code === 'PAYLOAD_TOO_LARGE';
    case 415:
      return error.code === 'UNSUPPORTED_MEDIA_TYPE';
    default:
      return false;
  }
}

/**
 * ¿Tiene sentido repetir la MISMA operación? Sí ante fallos que pueden ser pasajeros (red, 5xx,
 * respuesta ilegible o inesperada). No ante 400/404/409/413/415: repetir sin cambiar nada da el mismo
 * resultado; hay que corregir los datos o recargar para ver el estado real.
 */
export function isRetryable(error: ApiError): boolean {
  return error.kind === 'network' || error.kind === 'server' || error.kind === 'unreadable' || error.kind === 'unexpected';
}

export const api = {
  listTasks(status: TaskStatus | undefined, signal?: AbortSignal): Promise<Task[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return request(`/tasks${query}`, { signal }, taskListSchema);
  },

  createTask(input: CreateTaskRequest): Promise<Task> {
    return request('/tasks', { method: 'POST', body: JSON.stringify(input) }, taskSchema);
  },

  updateTaskStatus(id: number, status: TaskStatus): Promise<Task> {
    const body: UpdateTaskStatusRequest = { status };
    return request(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) }, taskSchema);
  },
};
