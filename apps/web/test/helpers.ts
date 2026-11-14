import type { Task } from '@task-manager/shared';
import { vi } from 'vitest';

/**
 * Ayudantes de los tests de la web. Estos tests usan una API SIMULADA (`fetch` falso): prueban
 * el comportamiento de la interfaz, NO la integración real con la API (eso se comprueba aparte,
 * con la API de verdad detrás del rewrite de Next).
 */

export interface Call {
  url: string;
  method: string;
  body?: unknown;
}

export type Handler = (call: Call) => Response | Promise<Response>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const errorResponse = (
  status: number,
  code: string,
  message: string,
  details?: { path: string; message: string }[],
) => jsonResponse({ error: { code, message, ...(details ? { details } : {}) } }, status);

export function installFetch(handler: Handler) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    gets: () => calls.filter((c) => c.method === 'GET'),
    posts: () => calls.filter((c) => c.method === 'POST'),
    patches: () => calls.filter((c) => c.method === 'PATCH'),
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Preparar demo',
    assignee: 'Ana',
    status: 'pending',
    createdAt: '2026-11-13T20:40:00.123Z',
    updatedAt: '2026-11-13T20:40:00.123Z',
    ...overrides,
  };
}
