import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Ruta de la base SQLite plantilla, creada con `prisma migrate deploy`. */
    templateDb: string;
  }
}
