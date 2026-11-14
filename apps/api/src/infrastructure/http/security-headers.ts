import type { NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';

/**
 * Cabeceras de seguridad de la API (Helmet).
 *
 * - Respuestas de la API (JSON): CSP mínima `default-src 'none'; frame-ancestors 'none'`. Un JSON
 *   no necesita cargar nada, y así no se puede incrustar ni ejecutar como página.
 * - Swagger UI (/api/docs, solo fuera de producción): la CSP por defecto de Helmet, que permite los
 *   scripts del propio servidor, los estilos inline y los iconos `data:` que usa Swagger UI.
 *
 * HSTS se desactiva: la API se sirve por HTTP y el HTTPS, si lo hubiera, lo pondría un proxy
 * delante; es ese proxy quien debe decidir HSTS para todo el dominio.
 *
 * CORS NO se activa a propósito: sin `Access-Control-Allow-Origin` el navegador no deja que otra
 * web lea las respuestas. La web llama a `/api` en su propio origen y Next reenvía a la API.
 */
const common = { strictTransportSecurity: false } as const;

const apiHeaders = helmet({
  ...common,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  },
});

const docsHeaders = helmet({
  ...common,
  contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
});

export function securityHeaders(options: { docsPrefix?: string }): RequestHandler {
  const { docsPrefix } = options;
  return (req: Request, res: Response, next: NextFunction) => {
    // Solo la interfaz (/api/docs y sus recursos /api/docs/...). /api/docs-json es JSON: CSP estricta.
    const isDocs = docsPrefix !== undefined && (req.path === docsPrefix || req.path.startsWith(`${docsPrefix}/`));
    return (isDocs ? docsHeaders : apiHeaders)(req, res, next);
  };
}
