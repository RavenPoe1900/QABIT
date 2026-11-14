import {
  ASSIGNEE_MAX,
  TASK_STATUSES as CONTRACT_STATUSES,
  TITLE_MAX,
  createTaskSchema,
  issuesToDetails,
  type TaskStatus as ContractTaskStatus,
} from '@task-manager/shared';
import { describe, expect, it } from 'vitest';
import {
  ASSIGNEE_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  createNewTask,
} from '../src/modules/tasks/domain/new-task';
import { TaskValidationError } from '../src/modules/tasks/domain/task-errors';
import {
  TASK_STATUSES as DOMAIN_STATUSES,
  type TaskStatus as DomainTaskStatus,
} from '../src/modules/tasks/domain/task-status';

/**
 * El dominio es dueño de sus reglas y el contrato HTTP declara las suyas (para validar el
 * formulario y la petición). Este test garantiza que NUNCA divergen: si alguien cambia una sola
 * de las dos, falla. Es el precio de que el dominio no dependa del transporte.
 */

// Comprobación en tiempo de COMPILACIÓN: los dos tipos de estado son idénticos.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const statusTypesAreEqual: Equal<DomainTaskStatus, ContractTaskStatus> = true;

describe('paridad entre las reglas del dominio y las del contrato HTTP', () => {
  it('los estados son los mismos y en el mismo orden (también en tipos)', () => {
    expect(statusTypesAreEqual).toBe(true);
    expect([...DOMAIN_STATUSES]).toEqual([...CONTRACT_STATUSES]);
  });

  it('los límites de longitud son los mismos', () => {
    expect(TITLE_MAX_LENGTH).toBe(TITLE_MAX);
    expect(ASSIGNEE_MAX_LENGTH).toBe(ASSIGNEE_MAX);
  });

  const NOW = new Date('2026-01-01T00:00:00.000Z');
  const cases: [string, { title: string; assignee: string }][] = [
    ['válido', { title: 'Preparar demo', assignee: 'Ana' }],
    ['con espacios a recortar', { title: '  Demo  ', assignee: ' Ana ' }],
    ['título vacío', { title: '', assignee: 'Ana' }],
    ['título solo espacios', { title: '   ', assignee: 'Ana' }],
    ['título en el límite', { title: 'x'.repeat(120), assignee: 'Ana' }],
    ['título uno más del límite', { title: 'x'.repeat(121), assignee: 'Ana' }],
    ['título con espacios que lo dejan en el límite', { title: ` ${'x'.repeat(120)} `, assignee: 'Ana' }],
    ['responsable vacío', { title: 'T', assignee: '' }],
    ['responsable en el límite', { title: 'T', assignee: 'y'.repeat(60) }],
    ['responsable uno más del límite', { title: 'T', assignee: 'y'.repeat(61) }],
    ['ambos vacíos', { title: ' ', assignee: '' }],
    ['120 emojis (120 puntos de código, 240 unidades UTF-16)', { title: '😀'.repeat(120), assignee: 'Ana' }],
    ['121 emojis (uno más del límite)', { title: '😀'.repeat(121), assignee: 'Ana' }],
    ['61 emojis (122 unidades UTF-16 pero solo 61 puntos)', { title: '😀'.repeat(61), assignee: 'Ana' }],
    ['60 emojis en el responsable (en el límite)', { title: 'T', assignee: '😀'.repeat(60) }],
    ['61 emojis en el responsable (uno más)', { title: 'T', assignee: '😀'.repeat(61) }],
    ['espacio no separable a los lados', { title: ' Demo ', assignee: 'Ana' }],
    ['solo espacios no separables', { title: '  ', assignee: 'Ana' }],
    ['NUL al principio', { title: '\u0000abc', assignee: 'Ana' }],
    ['NUL en medio', { title: 'ab\u0000cd', assignee: 'Ana' }],
    ['salto de línea', { title: 'linea1\nlinea2', assignee: 'Ana' }],
    ['tabulador en el responsable', { title: 'T', assignee: 'A\tna' }],
    ['carácter de control C1 (U+0085)', { title: 'a\u0085b', assignee: 'Ana' }],
    ['DEL (U+007F)', { title: 'a\u007fb', assignee: 'Ana' }],
    ['control en un título demasiado largo (dos problemas a la vez)', { title: `\u0000${'x'.repeat(130)}`, assignee: 'Ana' }],
    ['control en ambos campos', { title: 'a\u0000', assignee: '\u0001b' }],
  ];

  it.each(cases)('«%s»: dominio y contrato aceptan o rechazan lo mismo, con los mismos datos y mensajes', (_name, input) => {
    const contract = createTaskSchema.safeParse(input);

    let domain: { ok: true; title: string; assignee: string } | { ok: false; problems: { path: string; message: string }[] };
    try {
      const task = createNewTask(input, NOW);
      domain = { ok: true, title: task.title, assignee: task.assignee };
    } catch (error) {
      if (!(error instanceof TaskValidationError)) throw error;
      domain = { ok: false, problems: error.problems.map((p) => ({ path: p.field, message: p.message })) };
    }

    expect(domain.ok).toBe(contract.success);
    if (contract.success && domain.ok) {
      expect({ title: domain.title, assignee: domain.assignee }).toEqual(contract.data);
    }
    if (!contract.success && !domain.ok) {
      expect(domain.problems).toEqual(issuesToDetails(contract.error.issues));
    }
  });
});
