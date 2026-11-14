import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../test/helpers/fake-clock';
import { InMemoryTaskRepository } from '../../../../test/helpers/in-memory-task-repository';
import { ConcurrentTaskUpdateError, TaskNotFoundError, TaskValidationError } from '../domain/task-errors';
import { applyStatusChange } from '../domain/task-status-change';
import { ChangeTaskStatusUseCase, MAX_STATUS_UPDATE_ATTEMPTS } from './change-task-status.use-case';
import type { TaskRepository } from './ports/task-repository.port';
import { CreateTaskUseCase } from './create-task.use-case';

const T0 = new Date('2026-01-01T00:00:00.000Z');
const T1 = new Date('2026-01-01T01:00:00.000Z');
const T2 = new Date('2026-01-01T02:00:00.000Z');

async function setup() {
  const repo = new InMemoryTaskRepository();
  const clock = new FakeClock(T0);
  const task = await new CreateTaskUseCase(repo, clock).execute({ title: 'T', assignee: 'A' });
  return { repo, clock, task, useCase: new ChangeTaskStatusUseCase(repo, clock) };
}

describe('CreateTaskUseCase (sin base de datos)', () => {
  it('el DOMINIO fija pending y las fechas; el repositorio solo guarda lo que recibe', async () => {
    const { task } = await setup();
    expect(task).toMatchObject({ status: 'pending', createdAt: T0, updatedAt: T0 });
  });

  it('con datos inválidos lanza un error de dominio y NO toca el repositorio', async () => {
    const repo = new InMemoryTaskRepository();
    const error = await new CreateTaskUseCase(repo, new FakeClock(T0))
      .execute({ title: '   ', assignee: 'A' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TaskValidationError);
    expect(error).not.toBeInstanceOf(HttpException);
    expect(repo.tasks).toHaveLength(0);
  });
});

describe('ChangeTaskStatusUseCase (sin base de datos)', () => {
  it('con otro estado guarda el cambio y fija updatedAt con el reloj', async () => {
    const { useCase, clock, task, repo } = await setup();
    clock.set(T1);

    const result = await useCase.execute(task.id, 'in_progress');

    expect(result).toMatchObject({ status: 'in_progress', createdAt: T0, updatedAt: T1 });
    expect(repo.updateCalls).toBe(1);
  });

  it('con el mismo estado devuelve la tarea sin escribir ni tocar updatedAt', async () => {
    const { useCase, clock, task, repo } = await setup();
    clock.set(T1);

    const result = await useCase.execute(task.id, 'pending');

    expect(result.updatedAt).toEqual(T0);
    expect(repo.updateCalls).toBe(0);
  });

  it('si la tarea no existe lanza un error de DOMINIO, no una excepción HTTP', async () => {
    const { useCase } = await setup();
    const error = await useCase.execute(999, 'done').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TaskNotFoundError);
    expect(error).not.toBeInstanceOf(HttpException);
  });

  it('concurrencia: si otra petición pone la tarea en el estado pedido entre la lectura y la escritura, NO reescribe updatedAt', async () => {
    const { repo, clock, task } = await setup();
    // Repositorio que simula que OTRA petición pone «done» (en T1) justo antes de nuestra escritura.
    const racing: TaskRepository = {
      list: (f) => repo.list(f),
      findById: (id) => repo.findById(id),
      create: (t) => repo.create(t),
      updateStatusIfUnchanged: async (id, expected, next, at) => {
        if (repo.updateCalls === 0) repo.forceStatus(id, 'done', T1);
        return repo.updateStatusIfUnchanged(id, expected, next, at);
      },
    };
    clock.set(T2);

    const result = await new ChangeTaskStatusUseCase(racing, clock).execute(task.id, 'done');

    // La escritura condicional falló (el estado ya no era «pending»), se releyó «done» y no hubo cambio.
    expect(result).toMatchObject({ status: 'done', updatedAt: T1 });
    expect((await repo.findById(task.id))?.updatedAt).toEqual(T1); // no T2
    expect(repo.updateCalls).toBe(1);
  });

  it('concurrencia: si la tarea sigue cambiando y se agotan los reintentos, lanza ConcurrentTaskUpdateError sin escribir', async () => {
    const { repo, clock, task } = await setup();
    let flip = false;
    const alwaysRacing: TaskRepository = {
      list: (f) => repo.list(f),
      create: (t) => repo.create(t),
      // Cada lectura ve un estado distinto del pedido, y cada escritura llega tarde.
      findById: async (id) => {
        flip = !flip;
        repo.forceStatus(id, flip ? 'pending' : 'in_progress', T1);
        return repo.findById(id);
      },
      updateStatusIfUnchanged: async (id, _expected, next, at) => {
        repo.forceStatus(id, 'in_progress', T1);
        return repo.updateStatusIfUnchanged(id, 'pending', next, at); // nunca coincide
      },
    };

    const error = await new ChangeTaskStatusUseCase(alwaysRacing, clock).execute(task.id, 'done').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConcurrentTaskUpdateError);
    expect(error).not.toBeInstanceOf(HttpException);
    expect(repo.updateCalls).toBe(MAX_STATUS_UPDATE_ATTEMPTS);
    expect((await repo.findById(task.id))?.status).not.toBe('done');
  });
});

describe('applyStatusChange (función pura)', () => {
  it('no cambia nada si el estado es el mismo', async () => {
    const { task } = await setup();
    expect(applyStatusChange(task, 'pending', T1)).toEqual({ changed: false, task });
  });

  it('actualiza estado y updatedAt si es distinto, sin mutar la original', async () => {
    const { task } = await setup();
    const { changed, task: next } = applyStatusChange(task, 'done', T1);
    expect(changed).toBe(true);
    expect(next).toMatchObject({ status: 'done', updatedAt: T1 });
    expect(task.status).toBe('pending');
  });
});
