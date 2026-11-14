'use client';

import { useRef, useState } from 'react';
import { useTasks } from '../hooks/useTasks';
import { PlusIcon } from './icons';
import { SearchField } from './SearchField';
import { SidePanel } from './SidePanel';
import { StatusFilter } from './StatusFilter';
import { TaskForm } from './TaskForm';
import { TaskList } from './TaskList';

/**
 * Frontera interactiva: todo lo que necesita estado o eventos vive por debajo de este
 * componente de cliente. La página (app/page.tsx) y el layout son componentes de servidor.
 */
export function TasksApp() {
  const t = useTasks();
  // Se guarda el id además del título: dos tareas seguidas con el MISMO título deben volver a anunciarse.
  const [created, setCreated] = useState<{ id: number; title: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [query, setQuery] = useState('');
  const newButton = useRef<HTMLButtonElement>(null);

  // Una tarea nueva siempre es «pending»: con otro filtro activo no aparecerá en la lista.
  const hiddenByFilter = created !== null && t.filter !== '' && t.filter !== 'pending';

  // El buscador filtra en el navegador las tareas ya cargadas (por título o responsable).
  const needle = query.trim().toLowerCase();
  const visible =
    t.tasks && needle
      ? t.tasks.filter(
          (task) => task.title.toLowerCase().includes(needle) || task.assignee.toLowerCase().includes(needle),
        )
      : t.tasks;

  function closePanel() {
    setPanelOpen(false);
    newButton.current?.focus(); // el foco vuelve al botón que abrió el panel
  }

  return (
    <div className="stack">
      <div aria-live="polite" className="live">
        {created !== null && (
          // `key` distinto por tarea: React vuelve a montar el aviso y el lector de pantalla lo anuncia de
          // nuevo aunque el texto sea idéntico al anterior (un texto que no cambia no se anuncia).
          <div key={created.id} className="notice notice-success">
            <p>
              Tarea «{created.title}» creada como Pendiente.
              {hiddenByFilter && ' No aparece con el filtro actual.'}
            </p>
            <div className="actions">
              {hiddenByFilter && (
                <button type="button" className="secondary" onClick={() => t.changeFilter('pending')}>
                  Ver pendientes
                </button>
              )}
              <button type="button" className="secondary" onClick={() => setCreated(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>

      <section aria-labelledby="tasks-heading" className="card list-card">
        <div className="card-head">
          <div className="card-title">
            <h2 id="tasks-heading">Tareas</h2>
            {visible !== null && (
              <p className="card-count">
                {visible.length} {visible.length === 1 ? 'registro' : 'registros'}
              </p>
            )}
          </div>
          <button
            ref={newButton}
            type="button"
            className="btn-new"
            aria-haspopup="dialog"
            onClick={() => setPanelOpen(true)}
          >
            <PlusIcon />
            Nueva tarea
          </button>
        </div>
        <div className="toolbar">
          <StatusFilter value={t.filter} onChange={t.changeFilter} />
          <SearchField value={query} onChange={setQuery} />
        </div>
        <TaskList
          tasks={visible}
          loading={t.loading}
          error={t.listError}
          filter={t.filter}
          query={query}
          pendingIds={t.pendingIds}
          actionErrors={t.actionErrors}
          onRetry={() => void t.reload()}
          onChangeStatus={(id, status) => void t.changeStatus(id, status)}
        />
      </section>

      <SidePanel
        open={panelOpen}
        onClose={closePanel}
        title="Nueva tarea"
        description="Indica un título y quién será el responsable. Se creará como Pendiente."
      >
        <TaskForm
          creating={t.creating}
          onCreate={t.create}
          onCancel={closePanel}
          onCreated={(task) => {
            setCreated({ id: task.id, title: task.title });
            closePanel();
          }}
          // Con el filtro ya en «Todas», cambiarlo no dispara nada: en ese caso se recarga la lista.
          onShowAll={() => {
            closePanel();
            if (t.filter === '') void t.reload();
            else t.changeFilter('');
          }}
        />
      </SidePanel>
    </div>
  );
}
