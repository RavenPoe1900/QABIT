import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorPage from '../error';

describe('pantalla de error inesperado del frontend', () => {
  afterEach(() => vi.restoreAllMocks());

  it('no muestra el mensaje, la traza ni ningún código del error; ofrece reintentar y recargar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const retry = vi.fn();
    const error = Object.assign(new Error('secreto: token=abc123 en /srv/app.ts:42'), { digest: 'd1g3st' });
    render(<ErrorPage error={error} retry={retry} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Algo ha salido mal en la aplicación.');
    expect(alert).not.toHaveTextContent(/secreto|token|abc123|app\.ts/);
    expect(alert).not.toHaveTextContent(/d1g3st|Referencia|Código/);
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('un valor lanzado que no es un Error tampoco se muestra', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorPage error="cadena rara" retry={() => {}} />);
    expect(screen.getByRole('alert')).not.toHaveTextContent('cadena rara');
  });
});
