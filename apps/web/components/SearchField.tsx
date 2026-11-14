'use client';

import { useId } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/** Buscador de la barra de filtros. La etiqueta queda para lectores de pantalla, como en `StatusFilter`. */
export function SearchField({ value, onChange }: Props) {
  const id = useId();
  return (
    <div className="field search">
      <label htmlFor={id} className="sr-only">
        Buscar tarea
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar tarea…"
        autoComplete="off"
      />
    </div>
  );
}
