import { describe, expect, it } from 'vitest';
import { ASSIGNEE_MAX_LENGTH, TITLE_MAX_LENGTH, createNewTask } from './new-task';
import { TaskValidationError } from './task-errors';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function problemsOf(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    if (error instanceof TaskValidationError) return error.problems;
    throw error;
  }
  throw new Error('se esperaba un TaskValidationError');
}

describe('dominio: createNewTask (invariantes de una tarea)', () => {
  it('toda tarea nace pendiente, con createdAt = updatedAt = now y los textos recortados', () => {
    expect(createNewTask({ title: '  Preparar demo  ', assignee: ' Ana ' }, NOW)).toEqual({
      title: 'Preparar demo',
      assignee: 'Ana',
      status: 'pending',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('la longitud se cuenta en puntos de código: 120 emojis caben y 121 no', () => {
    expect(() => createNewTask({ title: '😀'.repeat(120), assignee: 'A' }, NOW)).not.toThrow();
    expect(problemsOf(() => createNewTask({ title: '😀'.repeat(121), assignee: 'A' }, NOW))).toEqual([
      { field: 'title', message: 'El título admite como máximo 120 caracteres' },
    ]);
  });

  it('acepta justo en el límite', () => {
    expect(() =>
      createNewTask({ title: 'x'.repeat(TITLE_MAX_LENGTH), assignee: 'y'.repeat(ASSIGNEE_MAX_LENGTH) }, NOW),
    ).not.toThrow();
  });

  it.each([
    ['título vacío', { title: '', assignee: 'A' }, [{ field: 'title', message: 'El título es obligatorio' }]],
    ['título solo con espacios', { title: '   ', assignee: 'A' }, [{ field: 'title', message: 'El título es obligatorio' }]],
    [
      'título de 121 caracteres',
      { title: 'x'.repeat(TITLE_MAX_LENGTH + 1), assignee: 'A' },
      [{ field: 'title', message: 'El título admite como máximo 120 caracteres' }],
    ],
    ['responsable vacío', { title: 'T', assignee: '' }, [{ field: 'assignee', message: 'El responsable es obligatorio' }]],
    [
      'responsable de 61 caracteres',
      { title: 'T', assignee: 'y'.repeat(ASSIGNEE_MAX_LENGTH + 1) },
      [{ field: 'assignee', message: 'El responsable admite como máximo 60 caracteres' }],
    ],
    ['título que empieza por NUL', { title: '\u0000abc', assignee: 'A' }, [{ field: 'title', message: 'El título no puede contener caracteres de control' }]],
    ['responsable con un salto de línea', { title: 'T', assignee: 'a\nb' }, [{ field: 'assignee', message: 'El responsable no puede contener caracteres de control' }]],
    [
      'ambos vacíos (informa de los dos)',
      { title: ' ', assignee: ' ' },
      [
        { field: 'title', message: 'El título es obligatorio' },
        { field: 'assignee', message: 'El responsable es obligatorio' },
      ],
    ],
  ])('rechaza %s con un error de DOMINIO', (_name, input, problems) => {
    expect(problemsOf(() => createNewTask(input, NOW))).toEqual(problems);
  });
});
