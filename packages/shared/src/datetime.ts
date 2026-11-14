import { z } from 'zod';

/**
 * Formato de fecha del contrato: ISO 8601 en UTC con exactamente tres dígitos de
 * milisegundos, por ejemplo `2026-11-13T20:40:00.123Z` (lo que produce Date#toISOString).
 * Se rechazan desplazamientos horarios (`+01:00`) y precisiones distintas de 3.
 */
export const isoUtcMillisSchema = z.iso.datetime({ precision: 3 });
