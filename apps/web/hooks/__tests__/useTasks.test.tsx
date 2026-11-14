import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { deferred, errorResponse, installFetch, jsonResponse, makeTask } from '../../test/helpers';
import { useTasks } from '../useTasks';

/** Tests del hook con una API SIMULADA (`fetch` falso). */

const input = { title: 'Comprar leche', assignee: 'Marta' };

describe('useTasks: creación concurrente', () => {
  it('una segunda creación mientras hay otra en curso NO envía otro POST y se IGNORA (no es «sin confirmar»)', async () => {
    const post = deferred<Response>();
    const net = installFetch(({ method }) => (method === 'POST' ? post.promise : jsonResponse([])));
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    let first!: ReturnType<typeof result.current.create>;
    let second!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => {
      first = result.current.create(input); // empieza y queda esperando al servidor
      second = await result.current.create(input); // llega mientras la primera sigue en curso
    });

    expect(second).toEqual({ status: 'ignored' });
    expect(net.posts()).toHaveLength(1); // solo un POST salió

    await act(async () => {
      post.resolve(jsonResponse(makeTask({ id: 7, title: input.title }), 201));
      await first;
    });
    expect(await first).toMatchObject({ status: 'created' });
    expect(net.posts()).toHaveLength(1);
  });

  it('una creación posterior, ya terminada la primera, sí se envía', async () => {
    const net = installFetch(({ method }) =>
      method === 'POST' ? jsonResponse(makeTask({ id: 7 }), 201) : jsonResponse([]),
    );
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    await act(async () => {
      await result.current.create(input);
    });
    await act(async () => {
      await result.current.create(input);
    });

    expect(net.posts()).toHaveLength(2);
  });

  it('un fallo de la primera no se confunde con «ignored»: sigue siendo «sin confirmar»', async () => {
    installFetch(({ method }) =>
      method === 'POST' ? errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor') : jsonResponse([]),
    );
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    let outcome!: Awaited<ReturnType<typeof result.current.create>>;
    await act(async () => {
      outcome = await result.current.create(input);
    });

    expect(outcome.status).toBe('unconfirmed');
  });
});

describe('useTasks: elegir el mismo filtro', () => {
  it('no deja la interfaz en «Cargando…» ni borra la lista', async () => {
    const net = installFetch(() => jsonResponse([makeTask()]));
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(result.current.loading).toBe(false);
    const getsBefore = net.gets().length;

    act(() => {
      result.current.changeFilter(''); // el filtro ya era «Todas»
    });

    // Con el error antiguo la lista se vaciaba (null) y el efecto no volvía a cargarla jamás.
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.loading).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(result.current.tasks).toHaveLength(1);
    expect(net.gets()).toHaveLength(getsBefore); // y tampoco se lanzó una petición inútil
  });

  it('el mismo filtro elegido por segunda vez, tras cambiar, tampoco rompe nada', async () => {
    const net = installFetch(({ url }) => jsonResponse(url.includes('status=done') ? [] : [makeTask()]));
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    act(() => result.current.changeFilter('done'));
    await waitFor(() => expect(result.current.tasks).toEqual([]));
    const getsBefore = net.gets().length;

    act(() => result.current.changeFilter('done')); // mismo filtro otra vez
    expect(result.current.tasks).toEqual([]); // sigue siendo una lista vacía, NO «sin datos»
    expect(result.current.loading).toBe(false);
    expect(net.gets()).toHaveLength(getsBefore);
  });

  it('un filtro DISTINTO sí vacía la lista, carga y muestra lo nuevo', async () => {
    const net = installFetch(({ url }) =>
      jsonResponse(url.includes('status=done') ? [makeTask({ id: 2, status: 'done' })] : [makeTask()]),
    );
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    act(() => result.current.changeFilter('done'));
    expect(result.current.tasks).toBeNull(); // «cargando» para el filtro nuevo
    await waitFor(() => expect(result.current.tasks?.[0]?.id).toBe(2));
    expect(net.gets().at(-1)?.url).toBe('/api/tasks?status=done');
  });
});

describe('useTasks: un cambio de estado que falla', () => {
  async function failStatusChange(patch: () => Response) {
    const net = installFetch(({ method }) => (method === 'PATCH' ? patch() : jsonResponse([makeTask()])));
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    const getsBefore = net.gets().length;

    await act(async () => {
      await result.current.changeStatus(1, 'done');
    });
    return { net, result, getsBefore };
  }

  it.each([
    ['un fallo de red', () => { throw new TypeError('Failed to fetch'); }],
    ['un 500', () => errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor')],
    ['un 502 que no es JSON', () => new Response('Bad Gateway', { status: 502 })],
  ])('%s puede haber cambiado la tarea: recarga la lista y avisa de que quizá sí se aplicó', async (_n, patch) => {
    const { net, result, getsBefore } = await failStatusChange(patch);

    await waitFor(() => expect(net.gets().length).toBe(getsBefore + 1)); // se recargó
    expect(result.current.actionErrors[1]).toContain('Puede que el cambio sí se haya aplicado');
  });

  it('un 409 (la tarea cambió por otra petición) recarga la lista y lo explica', async () => {
    const { net, result, getsBefore } = await failStatusChange(() =>
      errorResponse(409, 'CONCURRENT_UPDATE', 'La tarea cambió mientras se actualizaba. Vuelve a cargarla e inténtalo de nuevo.'),
    );

    await waitFor(() => expect(net.gets().length).toBe(getsBefore + 1));
    expect(result.current.actionErrors[1]).toContain('Se ha recargado la lista');
    expect(result.current.actionErrors[1]).not.toContain('Puede que el cambio sí se haya aplicado');
  });

  it('un 404 (la tarea ya no existe) recarga la lista', async () => {
    const { net, result, getsBefore } = await failStatusChange(() =>
      errorResponse(404, 'TASK_NOT_FOUND', 'Tarea no encontrada'),
    );

    await waitFor(() => expect(net.gets().length).toBe(getsBefore + 1));
    expect(result.current.actionErrors[1]).toBe('La tarea ya no existe.');
  });

  it('un 400 de validación garantiza que no se cambió nada: NO recarga', async () => {
    const { net, result, getsBefore } = await failStatusChange(() =>
      errorResponse(400, 'VALIDATION_ERROR', 'Datos inválidos'),
    );

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(net.gets()).toHaveLength(getsBefore);
    expect(result.current.actionErrors[1]).toBe('Datos inválidos');
  });
});
