import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from '../page';

describe('página provisional', () => {
  it('muestra el título de la aplicación', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: 'Gestor de tareas' })).toBeInTheDocument();
  });
});
