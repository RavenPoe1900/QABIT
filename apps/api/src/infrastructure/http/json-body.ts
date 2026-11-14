import { json, type NextFunction, type Request, type Response } from 'express';
import { errorBody } from './error-response';

export const JSON_BODY_LIMIT = '100kb';

/** Parser JSON propio (la app se crea con `bodyParser: false`, ver app.setup.ts). */
export function jsonBodyParser() {
  return json({ limit: JSON_BODY_LIMIT });
}

/**
 * Identifica con precisión el error del parser: body-parser marca sus errores con `type`.
 * No se usa `instanceof SyntaxError`: un SyntaxError interno de la aplicación NO es un JSON
 * mal formado y debe acabar en un 500.
 */
export function isJsonParseError(error: unknown): boolean {
  return (error as { type?: unknown } | null)?.type === 'entity.parse.failed';
}

/**
 * Traduce los errores del parser al formato de error acordado. Cualquier otro error se
 * pasa tal cual al manejo de errores de Nest.
 */
export function jsonBodyErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isJsonParseError(error)) {
    res.status(400).json(errorBody('INVALID_JSON', 'El cuerpo no es JSON válido'));
    return;
  }

  const type = (error as { type?: unknown } | null)?.type;
  if (type === 'entity.too.large') {
    res
      .status(413)
      .json(errorBody('PAYLOAD_TOO_LARGE', `El cuerpo supera el límite de ${JSON_BODY_LIMIT}`));
    return;
  }
  if (type === 'encoding.unsupported' || type === 'charset.unsupported') {
    res
      .status(415)
      .json(errorBody('UNSUPPORTED_MEDIA_TYPE', 'Codificación del cuerpo no admitida'));
    return;
  }

  next(error);
}
