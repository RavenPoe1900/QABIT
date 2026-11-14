'use client';

import { useId, type Ref } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Mensaje de error del campo: lo marca como inválido y queda asociado como descripción. */
  error?: string;
  /** Límite de caracteres: muestra un contador discreto «n/máx». No corta lo que se escribe. */
  max?: number;
  /** Marca el campo como obligatorio y muestra «Obligatorio.». */
  required?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/** Campo de texto con etiqueta, error asociado (aria-describedby) y contador opcional. */
export function TextField({ label, value, onChange, error, max, required = false, ref }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        ref={ref}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        aria-required={required ? 'true' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="error" role="alert">
          {error}
        </p>
      )}
      {(required || max !== undefined) && (
        <div className="field-meta">
          {required ? <p className="hint">Obligatorio.</p> : <span />}
          {max !== undefined && <Counter length={value.length} max={max} />}
        </div>
      )}
    </div>
  );
}

/** Contador discreto «n/máx». No se anuncia en vivo; el límite se explica en el texto para lectores. */
function Counter({ length, max }: { length: number; max: number }) {
  return (
    <span className={length > max ? 'counter is-over' : 'counter'}>
      {length}/{max}
      <span className="sr-only"> caracteres como máximo</span>
    </span>
  );
}
