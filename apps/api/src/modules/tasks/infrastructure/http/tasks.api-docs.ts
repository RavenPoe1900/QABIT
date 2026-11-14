import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ERROR_MESSAGES, ID_MAX, TASK_STATUSES } from '@task-manager/shared';
import { JSON_BODY_LIMIT } from '../../../../infrastructure/http/json-body';
import { errorExample, schemaRef } from '../../../../infrastructure/http/openapi/schemas';

/** Respuesta de error con el formato acordado y ejemplos reales de la API. */
function errorResponse(
  status: number,
  description: string,
  examples: Record<string, ReturnType<typeof errorExample>>,
) {
  return ApiResponse({ status, description, schema: schemaRef('ApiError'), examples });
}

const validationError = (summary: string, path: string, message: string) =>
  errorExample(summary, {
    code: 'VALIDATION_ERROR',
    message: ERROR_MESSAGES.validation,
    details: [{ path, message }],
  });

const internalError = errorResponse(500, 'Error inesperado. Mensaje genérico: nunca incluye trazas ni detalles internos.', {
  internal: errorExample('Error inesperado', { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' }),
});

const payloadTooLarge = errorResponse(413, `El cuerpo supera ${JSON_BODY_LIMIT}.`, {
  tooLarge: errorExample('Cuerpo demasiado grande', {
    code: 'PAYLOAD_TOO_LARGE',
    message: `El cuerpo supera el límite de ${JSON_BODY_LIMIT}`,
  }),
});

const unsupportedMediaType = errorResponse(415, 'Codificación o juego de caracteres del cuerpo no admitidos.', {
  unsupported: errorExample('Codificación no admitida', {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Codificación del cuerpo no admitida',
  }),
});

const notAnObject = validationError(
  'Cuerpo ausente o que no es un objeto JSON (p. ej. Content-Type: text/plain)',
  '(body)',
  'Se esperaba un objeto JSON',
);

const invalidJson = errorExample('JSON mal formado', {
  code: 'INVALID_JSON',
  message: 'El cuerpo no es JSON válido',
});

export const ApiListTasks = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Lista las tareas',
      description:
        'Devuelve un array (sin paginación), de más reciente a más antigua: `createdAt` descendente y, ' +
        'en empate, `id` descendente. Sin `status`, o con `status=` vacío, devuelve todas las tareas. ' +
        'Un estado desconocido, un `status` repetido o cualquier otro parámetro de la query devuelve 400.',
    }),
    ApiQuery({
      name: 'status',
      required: false,
      allowEmptyValue: true,
      description: 'Filtra por estado. Vacío o ausente = todas.',
      schema: { type: 'string', enum: ['', ...TASK_STATUSES] },
    }),
    ApiResponse({
      status: 200,
      description: 'Lista de tareas (vacía si no hay ninguna).',
      schema: { type: 'array', items: schemaRef('Task') },
    }),
    errorResponse(400, 'Filtro inválido.', {
      unknownStatus: validationError('Estado desconocido o repetido', 'status', 'Estado no válido'),
      unknownParam: validationError('Parámetro no permitido', '(query)', 'Campos no permitidos: other'),
    }),
    internalError,
  );

export const ApiCreateTask = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Crea una tarea',
      description:
        'La tarea se crea siempre con estado `pending`. Enviar `status` (o cualquier campo no previsto) devuelve 400. ' +
        'Un 400 por validación o JSON mal formado, y un 413, garantizan que no se guardó nada; un 5xx o un fallo de ' +
        'red NO permiten saber si se guardó.',
    }),
    ApiBody({ schema: schemaRef('CreateTaskRequest') }),
    ApiResponse({ status: 201, description: 'Tarea creada.', schema: schemaRef('Task') }),
    errorResponse(400, 'Datos inválidos o JSON mal formado. No se guardó nada.', {
      emptyTitle: validationError('Título vacío', 'title', 'El título es obligatorio'),
      statusNotAllowed: validationError('Campo no permitido (p. ej. status)', '(body)', 'Campos no permitidos: status'),
      notAnObject,
      invalidJson,
    }),
    payloadTooLarge,
    unsupportedMediaType,
    internalError,
  );

export const ApiChangeTaskStatus = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Cambia el estado de una tarea',
      description:
        'Durante el núcleo se admite cualquier otro estado válido. Si se pide el estado que la tarea ya tiene, ' +
        'se devuelve la tarea SIN modificarla (`updatedAt` no cambia) con 200. `updatedAt` solo cambia cuando el ' +
        'estado cambia de verdad. La escritura es condicional (solo si el estado sigue siendo el leído); si otra ' +
        'petición lo cambia entre medias, se relee y se vuelve a decidir. Si sigue cambiando tras varios ' +
        'reintentos, responde 409 sin aplicar el cambio.',
    }),
    ApiParam({
      name: 'id',
      description: `Identificador numérico: solo dígitos, sin signo ni ceros a la izquierda, de 1 a ${ID_MAX}.`,
      schema: { type: 'integer', minimum: 1, maximum: ID_MAX },
    }),
    ApiBody({ schema: schemaRef('UpdateTaskStatusRequest') }),
    ApiResponse({ status: 200, description: 'Tarea actualizada (o sin cambios si el estado era el mismo).', schema: schemaRef('Task') }),
    errorResponse(400, 'Identificador o cuerpo inválidos, o JSON mal formado.', {
      invalidId: validationError('Identificador no válido', 'id', 'Identificador no válido'),
      invalidStatus: validationError('Estado no válido', 'status', 'Estado no válido'),
      notAnObject,
      invalidJson,
    }),
    errorResponse(404, 'La tarea no existe.', {
      notFound: errorExample('Tarea inexistente', { code: 'TASK_NOT_FOUND', message: 'Tarea no encontrada' }),
    }),
    errorResponse(409, 'La tarea siguió cambiando por otras peticiones y se agotaron los reintentos. No se aplicó el cambio.', {
      concurrent: errorExample('Cambio concurrente', {
        code: 'CONCURRENT_UPDATE',
        message: ERROR_MESSAGES.concurrentUpdate,
      }),
    }),
    payloadTooLarge,
    unsupportedMediaType,
    internalError,
  );
