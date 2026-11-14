import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorBody } from '@task-manager/shared';
import { errorBody, type JsonResponse } from './error-response';
import { RequestValidationError } from './zod-validation.pipe';

/** Códigos y mensajes genéricos para HttpException 4xx que no son ninguno de los anteriores. */
export const HTTP_ERRORS: Record<number, { code: string; message: string }> = {
  400: { code: 'BAD_REQUEST', message: 'La petición no es válida' },
  405: { code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'La petición es demasiado grande' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Tipo de contenido no admitido' },
};

export const GENERIC_HTTP_ERROR = { code: 'HTTP_ERROR', message: 'La petición no se pudo procesar' };

/**
 * Filtro GLOBAL de errores de transporte: validación de la petición, rutas inexistentes y
 * cualquier HttpException. No conoce ningún dominio: los errores de dominio de cada módulo los
 * traduce el filtro de su propio adaptador HTTP (p. ej. TaskErrorsFilter), que Nest aplica antes
 * que este. Solo convierte en 500 lo que realmente es inesperado y nunca envía trazas, rutas
 * internas ni detalles de la base de datos: eso va al log del servidor.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    const { status, body } = this.toResponse(exception);
    response.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof RequestValidationError) {
      return {
        status: 400,
        body: errorBody('VALIDATION_ERROR', exception.message, exception.details),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) {
        // Nest lanza NotFoundException cuando ninguna ruta coincide.
        return { status, body: errorBody('ROUTE_NOT_FOUND', 'Ruta no encontrada') };
      }
      if (status >= 400 && status < 500) {
        const known = HTTP_ERRORS[status] ?? GENERIC_HTTP_ERROR;
        return { status, body: errorBody(known.code, known.message) };
      }
    }

    // Todo lo demás es inesperado: un SyntaxError interno, un error de Prisma o un error de dominio
    // que ningún adaptador ha traducido (eso último sería un fallo de programación, no del cliente).
    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    return { status: 500, body: errorBody('INTERNAL_ERROR', 'Error interno del servidor') };
  }
}
