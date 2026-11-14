'use client';

import {
  ASSIGNEE_MAX,
  TITLE_MAX,
  createTaskSchema,
  issuesToDetails,
  type ApiErrorDetail,
  type Task,
} from '@task-manager/shared';
import { useRef, useState, type FormEvent } from 'react';
import type { CreateResult } from '../hooks/useTasks';
import { ErrorAlert } from './ErrorAlert';
import { TextField } from './TextField';

interface Props {
  creating: boolean;
  onCreate: (input: { title: string; assignee: string }) => Promise<CreateResult>;
  onCreated: (task: Task) => void;
  /** Muestra todas las tareas (para que el usuario revise antes de volver a enviar). */
  onShowAll: () => void;
  /** Cierra el panel sin crear nada (el borrador se conserva). */
  onCancel: () => void;
}

interface FieldErrors {
  title?: string;
  assignee?: string;
  form?: string;
}

/** Envío cuyo resultado no se pudo confirmar. Solo el usuario cierra el aviso. */
interface Unconfirmed {
  title: string;
  assignee: string;
  count: number;
}

function toFieldErrors(details: ApiErrorDetail[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const { path, message } of details) {
    if (path === 'title' || path === 'assignee') errors[path] ??= message;
    else errors.form ??= message;
  }
  return errors;
}

export function TaskForm({ creating, onCreate, onCreated, onShowAll, onCancel }: Props) {
  const titleInput = useRef<HTMLInputElement>(null);
  const assigneeInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [unconfirmed, setUnconfirmed] = useState<Unconfirmed | null>(null);

  // Mismos datos que el envío sin confirmar (tras recortar espacios, como hace el contrato).
  const sameAsUnconfirmed =
    unconfirmed !== null &&
    unconfirmed.title === title.trim() &&
    unconfirmed.assignee === assignee.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return; // evita envíos duplicados

    // El mismo esquema que valida la API. Si falla, NO se hace ninguna petición.
    const parsed = createTaskSchema.safeParse({ title, assignee });
    if (!parsed.success) {
      const next = toFieldErrors(issuesToDetails(parsed.error.issues));
      setErrors(next);
      (next.title ? titleInput : assigneeInput).current?.focus();
      return;
    }
    setErrors({});

    submitting.current = true;
    try {
      const result = await onCreate(parsed.data);
      if (result.status === 'created') {
        setTitle('');
        setAssignee('');
        onCreated(result.task);
      } else if (result.status === 'ignored') {
        // Había otro envío en curso: esta llamada no envió nada y no hay nada que mostrar.
      } else if (result.status === 'rejected') {
        // El servidor garantiza que no se guardó nada: se conservan los datos, se explica por qué y
        // el foco va al primer campo rechazado.
        const next = toFieldErrors(
          result.error.details.length ? result.error.details : [{ path: '(body)', message: result.error.message }],
        );
        setErrors(next);
        if (next.title) titleInput.current?.focus();
        else if (next.assignee) assigneeInput.current?.focus();
      } else {
        // No se puede saber si se guardó. Se conservan los datos y se avisa; el aviso NO se cierra solo.
        setUnconfirmed((previous) => ({
          title: parsed.data.title,
          assignee: parsed.data.assignee,
          count: (previous?.count ?? 0) + 1,
        }));
      }
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form className="panel-form" onSubmit={handleSubmit} noValidate aria-label="Nueva tarea">
      <div className="panel-body">
        <TextField
          ref={titleInput}
          label="Título"
          value={title}
          onChange={setTitle}
          error={errors.title}
          max={TITLE_MAX}
          required
        />
        <TextField
          ref={assigneeInput}
          label="Responsable"
          value={assignee}
          onChange={setAssignee}
          error={errors.assignee}
          max={ASSIGNEE_MAX}
          required
        />

        {errors.form && (
          <ErrorAlert title="No se pudo crear la tarea.">
            <p>{errors.form}</p>
          </ErrorAlert>
        )}

        {unconfirmed && (
          <ErrorAlert
            tone="warning"
            title="No se pudo confirmar si la tarea se creó."
            actions={
              <>
                <button type="button" className="secondary" onClick={onShowAll}>
                  Ver todas las tareas
                </button>
                <button type="button" className="secondary" onClick={() => setUnconfirmed(null)}>
                  Cerrar aviso
                </button>
              </>
            }
          >
            <p>
              Revisa la lista antes de volver a enviarla: si ya aparece, no la crees de nuevo. Que la lista se
              recargue, o que la tarea no aparezca, no prueba por sí solo qué ocurrió con el envío.
            </p>
            {unconfirmed.count > 1 && <p>Hay {unconfirmed.count} envíos sin confirmar.</p>}
            {!sameAsUnconfirmed && (
              <p>
                Has cambiado los datos: si la tarea anterior sí se guardó, este envío creará una tarea
                adicional.
              </p>
            )}
          </ErrorAlert>
        )}
      </div>

      <div className="panel-footer">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" disabled={creating}>
          {creating ? 'Creando…' : sameAsUnconfirmed ? 'Ya revisé la lista, crear de nuevo' : 'Crear tarea'}
        </button>
      </div>
    </form>
  );
}
