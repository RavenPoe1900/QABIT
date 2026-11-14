import type { PipeTransform } from '@nestjs/common';
import { issuesToDetails, type ApiErrorDetail } from '@task-manager/shared';

/** La petición no cumple el contrato. El filtro global la convierte en un 400. */
export class RequestValidationError extends Error {
  constructor(public readonly details: ApiErrorDetail[]) {
    super('Datos inválidos');
    this.name = 'RequestValidationError';
  }
}

/** Forma mínima de un esquema Zod: así la API no necesita importar zod directamente. */
interface SafeParser<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> };
      };
}

/**
 * Valida con el esquema del contrato compartido. El frontend usa los mismos esquemas, pero
 * esta es la validación que protege la API: los tipos de TypeScript no existen en ejecución.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  /**
   * @param rootPath cómo se llama en `details.path` un problema que afecta al valor entero
   *   (por ejemplo un campo no permitido, o un `id` mal formado): `(body)`, `(query)` o `id`.
   */
  constructor(
    private readonly schema: SafeParser<T>,
    private readonly rootPath = '(body)',
  ) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details = issuesToDetails(result.error.issues).map((detail) =>
        detail.path === '(body)' ? { ...detail, path: this.rootPath } : detail,
      );
      throw new RequestValidationError(details);
    }
    return result.data;
  }
}
