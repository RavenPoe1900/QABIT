import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextField } from '../TextField';

describe('contador de TextField', () => {
  it('cuenta puntos de código y no marca exceso con 70 emojis (140 unidades UTF-16)', () => {
    const { container } = render(<TextField label="Título" value={'😀'.repeat(70)} onChange={() => {}} max={120} />);
    expect(screen.getByText(/^70\/120/)).toBeInTheDocument();
    expect(container.querySelector('.counter.is-over')).toBeNull();
  });

  it('ignora los espacios de los extremos, como el contrato', () => {
    render(<TextField label="Título" value={'  ab  '} onChange={() => {}} max={120} />);
    expect(screen.getByText(/^2\/120/)).toBeInTheDocument();
  });
});
