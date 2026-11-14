'use client';

import { TASK_STATUSES } from '@task-manager/shared';
import { useId } from 'react';
import { STATUS_LABELS, type TaskFilter } from '../lib/labels';

interface Props {
  value: TaskFilter;
  onChange: (filter: TaskFilter) => void;
}

export function StatusFilter({ value, onChange }: Props) {
  const id = useId();
  return (
    <div className="field filter">
      {/* La etiqueta sigue ahí para lectores de pantalla; en pantalla basta con el propio selector. */}
      <label htmlFor={id} className="sr-only">
        Filtrar por estado
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as TaskFilter)}>
        <option value="">Todas</option>
        {TASK_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </div>
  );
}
