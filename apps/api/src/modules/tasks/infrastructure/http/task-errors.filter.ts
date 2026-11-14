import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorBody } from '@task-manager/shared';
import { errorBody, type JsonResponse } from '../../../../infrastructure/http/error-response';
import {
  ConcurrentTaskUpdateError,
  TaskNotFoundError,
  TaskValidationError,
} from '../../domain/task-errors';

type TaskDomainError = TaskNotFoundError | TaskValidationError | ConcurrentTaskUpdateError;

/**
 * Traducción de los errores del DOMINIO de tareas a HTTP. Vive en el adaptador HTTP del módulo:
 * el dominio no conoce códigos de estado ni códigos de la API.
 */
export function taskErrorToHttp(error: TaskDomainError): { status: number; body: ApiErrorBody } {
  if (error instanceof TaskNotFoundError) {
    return { status: 404, body: errorBody('TASK_NOT_FOUND', 'Tarea no encontrada') };
  }
  if (error instanceof TaskValidationError) {
    return {
      status: 400,
      body: errorBody(
        'VALIDATION_ERROR',
        'Datos inválidos',
        error.problems.map((problem) => ({ path: problem.field, message: problem.message })),
      ),
    };
  }
  return {
    status: 409,
    body: errorBody(
      'CONCURRENT_UPDATE',
      'La tarea cambió mientras se actualizaba. Vuelve a cargarla e inténtalo de nuevo.',
    ),
  };
}

@Catch(TaskNotFoundError, TaskValidationError, ConcurrentTaskUpdateError)
export class TaskErrorsFilter implements ExceptionFilter {
  catch(error: TaskDomainError, host: ArgumentsHost): void {
    const { status, body } = taskErrorToHttp(error);
    host.switchToHttp().getResponse<JsonResponse>().status(status).json(body);
  }
}
