import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Configuración única de la aplicación, compartida por main.ts y por los tests.
 * Así la API se prueba sin abrir ningún puerto.
 */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  app.disable('x-powered-by');
}
