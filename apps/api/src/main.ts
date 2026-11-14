import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_OPTIONS, initApp } from './app.setup';
import { loadApiEnv, resolveDbPath, resolveHost, resolvePort } from './config/env';

async function bootstrap(): Promise<void> {
  loadApiEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS);
  await initApp(app);
  app.enableShutdownHooks();

  const port = resolvePort();
  const host = resolveHost();
  await app.listen(port, host);

  const logger = new Logger('Bootstrap');
  logger.log(`API escuchando en http://${host}:${port}/api`);
  logger.log(`Base de datos SQLite: ${resolveDbPath()}`);
}

bootstrap().catch((error: unknown) => {
  // Un fallo de arranque (p. ej. un PORT inválido o un puerto ocupado) se muestra claro y sale con código 1.
  new Logger('Bootstrap').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
