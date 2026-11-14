import { describe, expect, it } from 'vitest';
import { createTaskSchema, textLength } from '../src/index';

describe('textLength: misma medida que el contrato', () => {
  it('recorta los extremos y cuenta puntos de código (un emoji es 1)', () => {
    expect(textLength('  hola  ')).toBe(4);
    expect(textLength('😀'.repeat(70))).toBe(70);
  });

  it('coincide con lo que acepta createTaskSchema en el límite', () => {
    const exact = '😀'.repeat(120);
    expect(textLength(exact)).toBe(120);
    expect(createTaskSchema.safeParse({ title: exact, assignee: 'Ana' }).success).toBe(true);
    expect(createTaskSchema.safeParse({ title: `${exact}x`, assignee: 'Ana' }).success).toBe(false);
  });
});
