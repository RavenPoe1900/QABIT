/**
 * Límites del contrato. La misma regla se aplica en Zod (frontend y backend), en el dominio de la
 * API y en los CHECK de SQLite (migración inicial).
 *
 * Unicode (comprobado con Zod 4.6.7 y SQLite): la longitud se cuenta en PUNTOS DE CÓDIGO, tanto en
 * Zod como en `length()` de SQLite, así que un emoji cuenta 1 en ambos. Los caracteres compuestos
 * (por ejemplo «e» + acento combinante) cuentan como varios puntos de código.
 */
export const TITLE_MAX = 120;
export const ASSIGNEE_MAX = 60;

/** Longitud de un texto tal como la cuenta el contrato: sin espacios de los extremos y en puntos de código. */
export const textLength = (value: string): number => Array.from(value.trim()).length;

/** Mayor identificador admitido: el tipo Int de Prisma/SQLite en este proyecto es de 32 bits. */
export const ID_MAX = 2_147_483_647;
