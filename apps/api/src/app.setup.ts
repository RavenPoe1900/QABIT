import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { ApiExceptionFilter } from './infrastructure/http/api-exception.filter';
import { errorBody } from './infrastructure/http/error-response';
import { jsonBodyErrorHandler, jsonBodyParser } from './infrastructure/http/json-body';

/**
 * La aplicación se crea SIN el parser de cuerpo de Nest: lo registramos nosotros en
 * configureApp para poder identificar con precisión el error de JSON mal formado.
 * Debe usarse tanto en main.ts como en los tests.
 */
export const APP_OPTIONS = { bodyParser: false } as const;

/** Configuración previa a `app.init()`. Usa `initApp`, que además registra el 404 final. */
export function configureApp(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  app.use(jsonBodyParser(), jsonBodyErrorHandler);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
}

/**
 * Configuración única de la aplicación, compartida por main.ts y por los tests (así la API se
 * prueba sin abrir ningún puerto). Configura, inicializa y registra el 404 final.
 */
export async function initApp(app: NestExpressApplication): Promise<void> {
  configureApp(app);
  await app.init();

  // Nest solo registra su 404 bajo el prefijo /api; cualquier otra ruta (p. ej. /nope) la
  // contestaría Express con su respuesta por defecto. Este manejador final unifica el formato.
  app.use((_req: Request, res: Response) => {
    res.status(404).json(errorBody('ROUTE_NOT_FOUND', 'Ruta no encontrada'));
  });
}
