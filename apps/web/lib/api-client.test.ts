import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, isAbortError, isSafeRejection } from './api-client';
import { errorResponse, installFetch, jsonResponse, makeTask } from '../test/helpers';

afterEach(() => vi.unstubAllGlobals());

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => {
      throw new Error('se esperaba un fallo');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('cliente de la API: clasificación de errores (API simulada)', () => {
  it('una respuesta correcta se valida con el contrato compartido', async () => {
    const task = makeTask();
    installFetch(() => jsonResponse([task]));
    await expect(api.listTasks(undefined)).resolves.toEqual([task]);
  });

  it('pide ?status= solo cuando hay filtro y codifica el valor', async () => {
    const { calls } = installFetch(() => jsonResponse([]));
    await api.listTasks(undefined);
    await api.listTasks('in_progress');
    expect(calls.map((c) => c.url)).toEqual(['/api/tasks', '/api/tasks?status=in_progress']);
  });

  it.each([
    [400, 'VALIDATION_ERROR', 'validation'],
    [404, 'TASK_NOT_FOUND', 'not_found'],
    [409, 'CONCURRENT_UPDATE', 'conflict'],
    [413, 'PAYLOAD_TOO_LARGE', 'rejected'],
    [415, 'UNSUPPORTED_MEDIA_TYPE', 'rejected'],
    [500, 'INTERNAL_ERROR', 'server'],
  ])('un %i con el formato acordado es «%s» -> kind %s', async (status, code, kind) => {
    installFetch(() => errorResponse(status, code, 'mensaje del servidor'));
    const error = await failureOf(api.updateTaskStatus(1, 'done'));
    // Un 5xx muestra un texto llano (el de la API es técnico); el resto conserva el mensaje del servidor.
    const message = kind === 'server' ? 'Algo ha fallado de nuestro lado. Inténtalo de nuevo en unos minutos.' : 'mensaje del servidor';
    expect(error).toMatchObject({ kind, status, code, message });
  });

  it('conserva los details de un error de validación', async () => {
    installFetch(() => errorResponse(400, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'title', message: 'x' }]));
    const error = await failureOf(api.createTask({ title: '', assignee: 'A' }));
    expect(error.details).toEqual([{ path: 'title', message: 'x' }]);
  });

  it('un fallo de red es «network» y no afirma ninguna causa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await failureOf(api.listTasks(undefined));
    expect(error.kind).toBe('network');
    expect(error.message).not.toMatch(/Nest|caíd|apagad|servidor está/i);
  });

  it('un error que NO es JSON (p. ej. del proxy) es «unexpected»; el código HTTP se guarda pero NO se muestra', async () => {
    installFetch(() => new Response('Bad Gateway', { status: 502 }));
    const error = await failureOf(api.listTasks(undefined));
    expect(error).toMatchObject({ kind: 'unexpected', status: 502 });
    expect(error.message).toBe('Algo ha salido mal. Inténtalo de nuevo en unos minutos.');
    expect(error.message).not.toMatch(/\d/);
    expect(error.message).not.toMatch(/Nest|caíd|apagad/i);
  });

  it('un 500 sin el formato de error acordado también es «unexpected»', async () => {
    installFetch(() => jsonResponse({ boom: true }, 500));
    const error = await failureOf(api.listTasks(undefined));
    expect(error).toMatchObject({ kind: 'unexpected', status: 500, code: undefined });
  });

  it('un 200 con una forma que incumple el contrato no se pinta: es «unexpected»', async () => {
    installFetch(() => jsonResponse([{ id: 1, title: 'sin el resto de campos' }]));
    const error = await failureOf(api.listTasks(undefined));
    expect(error).toMatchObject({ kind: 'unexpected', message: 'Recibimos una respuesta que no hemos podido entender. Inténtalo de nuevo en unos minutos.' });
  });

  it('un 200 que no es JSON es «unexpected»', async () => {
    installFetch(() => new Response('<html>hola</html>', { status: 200 }));
    expect((await failureOf(api.listTasks(undefined))).kind).toBe('unexpected');
  });

  it('si no se puede LEER el cuerpo de la respuesta es «unreadable»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 201, text: () => Promise.reject(new Error('cortado')) }),
    );
    const error = await failureOf(api.createTask({ title: 'T', assignee: 'A' }));
    expect(error).toMatchObject({ kind: 'unreadable', status: 201 });
  });

  it('un AbortError se propaga tal cual (no es un error que mostrar)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('abortado', 'AbortError')));
    const error = await api.listTasks(undefined).catch((e: unknown) => e);
    expect(isAbortError(error)).toBe(true);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

describe('isSafeRejection: ¿garantiza el contrato que NO se guardó nada?', () => {
  const error = (status: number, code?: string, kind: ApiError['kind'] = 'unexpected') =>
    new ApiError(kind, 'x', status, code);

  it.each([
    [400, 'VALIDATION_ERROR'],
    [400, 'INVALID_JSON'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
  ])('%i %s -> rechazo seguro', (status, code) => {
    expect(isSafeRejection(error(status, code))).toBe(true);
  });

  it.each([
    ['cualquier 404 (puede ser una ruta mal configurada)', error(404, 'TASK_NOT_FOUND')],
    ['un 404 de ruta', error(404, 'ROUTE_NOT_FOUND')],
    ['un 500', error(500, 'INTERNAL_ERROR')],
    ['un 400 sin el formato acordado (sin código)', error(400)],
    ['un 400 con un código ajeno al contrato', error(400, 'BAD_REQUEST')],
    ['un 201 con cuerpo inválido', error(201)],
    ['un fallo de red (sin estado)', new ApiError('network', 'x')],
    ['una respuesta ilegible', new ApiError('unreadable', 'x', 201)],
  ])('%s -> NO es un rechazo seguro (queda sin confirmar)', (_name, apiError) => {
    expect(isSafeRejection(apiError)).toBe(false);
  });
});
