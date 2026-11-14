import type { NewTask } from './task';
import { TaskValidationError, type TaskValidationProblem } from './task-errors';
import { INITIAL_TASK_STATUS } from './task-status';

/**
 * Invariantes de una tarea. Coinciden con las del contrato HTTP (Zod en `@task-manager/shared`);
 * el test de paridad comprueba que ambos aceptan y rechazan exactamente lo mismo.
 */
export const TITLE_MAX_LENGTH = 120;
export const ASSIGNEE_MAX_LENGTH = 60;

/**
 * Caracteres de control (U+0000–U+001F y U+007F–U+009F). SQLite deja de contar en el primer NUL,
 * así que un texto que empieza por NUL pasaría la validación y fallaría el CHECK de la base.
 */
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/;

export interface NewTaskInput {
  title: string;
  assignee: string;
}

/** Longitud en PUNTOS DE CÓDIGO (como Zod y como `length()` de SQLite): un emoji cuenta 1. */
const lengthOf = (value: string): number => Array.from(value).length;

function checkText(
  field: TaskValidationProblem['field'],
  label: string,
  value: string,
  max: number,
  problems: TaskValidationProblem[],
): void {
  const length = lengthOf(value);
  if (length === 0) {
    problems.push({ field, message: `${label} es obligatorio` });
  } else if (length > max) {
    problems.push({ field, message: `${label} admite como máximo ${max} caracteres` });
  }
  if (CONTROL_CHARACTERS.test(value)) {
    problems.push({ field, message: `${label} no puede contener caracteres de control` });
  }
}

/**
 * Crea una tarea nueva aplicando las reglas de negocio: recorta los espacios de los extremos,
 * exige título (1–120) y responsable (1–60) sin caracteres de control, y la tarea nace siempre
 * `pending` con `createdAt === updatedAt === now`. Lanza `TaskValidationError` si algo no se
 * cumple. Así las invariantes no dependen de qué adaptador de entrada se use.
 */
export function createNewTask(input: NewTaskInput, now: Date): NewTask {
  const title = input.title.trim();
  const assignee = input.assignee.trim();

  const problems: TaskValidationProblem[] = [];
  checkText('title', 'El título', title, TITLE_MAX_LENGTH, problems);
  checkText('assignee', 'El responsable', assignee, ASSIGNEE_MAX_LENGTH, problems);
  if (problems.length > 0) {
    throw new TaskValidationError(problems);
  }

  return { title, assignee, status: INITIAL_TASK_STATUS, createdAt: now, updatedAt: now };
}
