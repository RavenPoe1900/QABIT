import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JSON_BODY_LIMIT } from '../json-body';
import { openApiSchemas } from './schemas';

export const DOCS_PATH = 'api/docs';
export const DOCS_JSON_PATH = 'api/docs-json';

const DESCRIPTION = `
Contrato REST del gestor de tareas. Los esquemas se generan a partir de los esquemas Zod de
\`@task-manager/shared\`, los mismos que validan el formulario y la propia API.

**Errores.** Todos tienen la forma \`{ "error": { "code", "message", "details?" } }\`.
Una ruta inexistente (dentro o fuera de \`/api\`) devuelve 404 con \`code: "ROUTE_NOT_FOUND"\`.
Un error inesperado devuelve 500 con \`INTERNAL_ERROR\` y un mensaje genérico, sin trazas ni rutas internas.

**Cuerpos.** JSON de hasta ${JSON_BODY_LIMIT}. Los cuerpos y la query son estrictos: un campo no previsto devuelve 400.

**Seguridad.** Esta API no tiene autenticación ni autorización: cualquiera con acceso puede crear y
modificar tareas. No debe exponerse tal cual en una red pública.
`.trim();

/** Publica la documentación en /api/docs (interfaz) y /api/docs-json (documento OpenAPI). */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Task Manager API')
    .setVersion('1.0.0')
    .setDescription(DESCRIPTION)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ...openApiSchemas },
  };

  SwaggerModule.setup(DOCS_PATH, app, document, { jsonDocumentUrl: DOCS_JSON_PATH });
}
