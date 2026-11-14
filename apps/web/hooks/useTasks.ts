'use client';

import type { CreateTaskRequest, Task, TaskStatus } from '@task-manager/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, isAbortError, isSafeRejection, toApiError } from '../lib/api-client';
import type { TaskFilter } from '../lib/labels';

/**
 * Resultado de intentar crear una tarea. Son TRES casos, no dos:
 *  - created:     201 con una tarea válida.
 *  - rejected:    el contrato garantiza que NO se guardó nada (ver isSafeRejection).
 *  - unconfirmed: no se puede saber si se guardó (5xx, red, respuesta ilegible o inesperada…).
 * Y un cuarto, que NO es un resultado de la API:
 *  - ignored:     ya había un envío en curso; esta llamada no envió NADA (ni se guardó ni falló).
 */
export type CreateResult =
  | { status: 'created'; task: Task }
  | { status: 'rejected'; error: ApiError }
  | { status: 'unconfirmed'; error: ApiError }
  | { status: 'ignored' };

/**
 * Mensaje de un cambio de estado que falló. Un fallo de red, un 5xx o una respuesta ilegible NO
 * permiten saber si el servidor llegó a aplicar el cambio, y hay que decirlo.
 */
function describeStatusChangeFailure(error: ApiError): string {
  if (error.kind === 'not_found') return 'La tarea ya no existe.';
  if (error.kind === 'conflict') {
    return 'La tarea cambió mientras se actualizaba. Se ha recargado la lista: revisa su estado e inténtalo de nuevo.';
  }
  if (isSafeRejection(error)) return error.message; // el contrato garantiza que no se cambió nada
  return `${error.message} Puede que el cambio sí se haya aplicado: revisa el estado actual en la lista.`;
}

export function useTasks() {
  const [filter, setFilter] = useState<TaskFilter>('');
  /** `null` = todavía no hay datos para el filtro actual. */
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<ApiError | null>(null);

  const [creating, setCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());
  const [actionErrors, setActionErrors] = useState<Readonly<Record<number, string>>>({});

  /** Filtro VIGENTE: se actualiza de forma síncrona, antes del siguiente render. */
  const filterRef = useRef<TaskFilter>('');
  /** Número de la última carga lanzada: una respuesta con otro número es antigua y se descarta. */
  const requestSeq = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const creatingRef = useRef(false);
  const pendingRef = useRef<Set<number>>(new Set());

  const load = useCallback(async (status: TaskFilter): Promise<void> => {
    controller.current?.abort(); // cancela la carga anterior…
    const current = new AbortController();
    controller.current = current;
    const seq = ++requestSeq.current; // …y además invalida su respuesta aunque ya hubiera llegado
    setLoading(true);
    setListError(null);

    try {
      const result = await api.listTasks(status || undefined, current.signal);
      if (seq !== requestSeq.current) return; // respuesta antigua: no pisa a la nueva
      setTasks(result);
    } catch (error) {
      if (seq !== requestSeq.current || isAbortError(error)) return;
      setListError(toApiError(error));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
    return () => controller.current?.abort();
  }, [filter, load]);

  /** Recarga con el filtro VIGENTE (no el de cuando se lanzó la operación). */
  const reload = useCallback((): Promise<void> => load(filterRef.current), [load]);

  const changeFilter = useCallback((next: TaskFilter) => {
    // Elegir el filtro que ya está activo no cambia nada: si se vaciara la lista, el efecto no se
    // volvería a ejecutar (el valor es el mismo) y la pantalla se quedaría en «Cargando…» para siempre.
    if (next === filterRef.current) return;
    filterRef.current = next; // síncrono: cualquier recarga posterior ya usa el filtro nuevo
    setTasks(null); // la lista del filtro anterior no es válida para el nuevo
    setFilter(next);
  }, []);

  const create = useCallback(
    async (input: CreateTaskRequest): Promise<CreateResult> => {
      if (creatingRef.current) {
        // Defensa contra envíos duplicados además del botón deshabilitado. NO se envía nada, así que
        // no es una creación «sin confirmar»: simplemente se ignora.
        return { status: 'ignored' };
      }
      creatingRef.current = true;
      setCreating(true);
      try {
        const task = await api.createTask(input);
        void reload(); // la recarga es independiente: si falla, la creación sigue confirmada
        return { status: 'created', task };
      } catch (error) {
        const apiError = toApiError(error);
        if (isSafeRejection(apiError)) {
          return { status: 'rejected', error: apiError };
        }
        void reload(); // para que la lista refleje el estado real…
        return { status: 'unconfirmed', error: apiError }; // …sin tomar la recarga como prueba
      } finally {
        creatingRef.current = false;
        setCreating(false);
      }
    },
    [reload],
  );

  const changeStatus = useCallback(
    async (id: number, status: TaskStatus): Promise<void> => {
      if (pendingRef.current.has(id)) return;
      pendingRef.current.add(id);
      setPendingIds(new Set(pendingRef.current));
      try {
        await api.updateTaskStatus(id, status);
        setActionErrors((errors) => {
          const { [id]: _removed, ...rest } = errors;
          return rest;
        });
        void reload();
      } catch (error) {
        const apiError = toApiError(error);
        setActionErrors((errors) => ({ ...errors, [id]: describeStatusChangeFailure(apiError) }));
        // Solo un rechazo que garantiza que NO se cambió nada (400/413/415) deja la lista como estaba.
        // Cualquier otro fallo (red, 5xx, respuesta ilegible, 404, 409…) puede haber cambiado la tarea:
        // se recarga con el filtro vigente para no mostrar un estado viejo.
        if (!isSafeRejection(apiError)) void reload();
      } finally {
        pendingRef.current.delete(id);
        setPendingIds(new Set(pendingRef.current));
      }
    },
    [reload],
  );

  return {
    filter,
    changeFilter,
    tasks,
    loading,
    listError,
    reload,
    creating,
    create,
    pendingIds,
    actionErrors,
    changeStatus,
  };
}
