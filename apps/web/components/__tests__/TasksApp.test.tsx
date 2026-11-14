import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  deferred,
  errorResponse,
  installFetch,
  jsonResponse,
  makeTask,
  type Call,
} from '../../test/helpers';
import { TasksApp } from '../TasksApp';

/**
 * Tests de la interfaz con una API SIMULADA (`fetch` falso). Comprueban el comportamiento de la
 * pantalla, no la integración real con la API (esa se verifica aparte, con la API de verdad).
 */

const demo = makeTask({ id: 1, title: 'Preparar demo', status: 'pending' });
const review = makeTask({ id: 2, title: 'Revisar PR', assignee: 'Luis', status: 'done' });

const filterSelect = () => screen.getByLabelText('Filtrar por estado');
const createButton = () => screen.getByRole('button', { name: /crear/i });
const newTaskButton = () => screen.getByRole('button', { name: 'Nueva tarea' });
const panel = () => screen.getByRole('dialog', { name: 'Nueva tarea', hidden: true });

/** El formulario vive en un panel lateral: se abre con «Nueva tarea». */
async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(newTaskButton());
}

async function fillForm(user: ReturnType<typeof userEvent.setup>, title = 'Comprar leche', assignee = 'Marta') {
  await openPanel(user);
  await user.type(screen.getByLabelText('Título'), title);
  await user.type(screen.getByLabelText('Responsable'), assignee);
}

describe('obligatorio 1: formulario vacío', () => {
  it('muestra los errores por campo y NO envía la petición de creación', async () => {
    const user = userEvent.setup();
    const net = installFetch(() => jsonResponse([]));
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);

    await openPanel(user);
    await user.click(createButton());

    const title = screen.getByLabelText('Título');
    const assignee = screen.getByLabelText('Responsable');
    expect(await screen.findByText('El título es obligatorio')).toBeInTheDocument();
    expect(screen.getByText('El responsable es obligatorio')).toBeInTheDocument();
    // Accesibilidad: campo marcado como inválido y error asociado como descripción.
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('El título es obligatorio');
    expect(assignee).toHaveAccessibleDescription('El responsable es obligatorio');
    expect(title).toHaveFocus();

    // Hubo la petición inicial de listado, pero NINGUNA de creación.
    expect(net.posts()).toHaveLength(0);
    expect(net.calls).toHaveLength(1);
    expect(net.calls[0]).toMatchObject({ method: 'GET', url: '/api/tasks' });
  });
});

describe('obligatorio 2: lista y filtro', () => {
  it('muestra la lista, y al elegir un filtro pide ?status=… y muestra las tareas correspondientes', async () => {
    const user = userEvent.setup();
    const net = installFetch(({ url }) =>
      jsonResponse(url === '/api/tasks?status=done' ? [review] : [demo, review]),
    );
    render(<TasksApp />);

    expect(await screen.findByText('Preparar demo')).toBeInTheDocument();
    expect(screen.getByText('Revisar PR')).toBeInTheDocument();

    await user.selectOptions(filterSelect(), 'done');

    // La petición correcta…
    await waitFor(() => expect(net.gets().at(-1)?.url).toBe('/api/tasks?status=done'));
    // …y el resultado VISIBLE: solo la tarea hecha.
    await waitFor(() => expect(screen.queryByText('Preparar demo')).not.toBeInTheDocument());
    expect(screen.getByText('Revisar PR')).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
  });

  it('con «Todas» no envía ningún filtro', async () => {
    const user = userEvent.setup();
    const net = installFetch(() => jsonResponse([demo]));
    render(<TasksApp />);
    await screen.findByText('Preparar demo');
    await user.selectOptions(filterSelect(), 'pending');
    await user.selectOptions(filterSelect(), '');
    await waitFor(() => expect(net.gets().at(-1)?.url).toBe('/api/tasks'));
  });

  it('distingue lista vacía con y sin filtro', async () => {
    const user = userEvent.setup();
    installFetch(() => jsonResponse([]));
    render(<TasksApp />);
    expect(await screen.findByText(/Todavía no hay tareas/)).toBeInTheDocument();
    await user.selectOptions(filterSelect(), 'done');
    expect(await screen.findByText('No hay tareas con el estado «Hecha».')).toBeInTheDocument();
  });
});

describe('carga y errores de la lista', () => {
  it('muestra «Cargando» mientras espera y luego la lista', async () => {
    const pending = deferred<Response>();
    installFetch(() => pending.promise);
    render(<TasksApp />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando tareas…');

    pending.resolve(jsonResponse([demo]));
    expect(await screen.findByText('Preparar demo')).toBeInTheDocument();
    expect(screen.queryByText('Cargando tareas…')).not.toBeInTheDocument();
  });

  it('un error al cargar es visible y «Reintentar» vuelve a pedir la lista', async () => {
    const user = userEvent.setup();
    let fail = true;
    const net = installFetch(() =>
      fail ? errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor') : jsonResponse([demo]),
    );
    render(<TasksApp />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron cargar las tareas.');

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Preparar demo')).toBeInTheDocument();
    expect(net.gets()).toHaveLength(2);
  });

  it('un fallo de red se muestra sin afirmar ninguna causa', async () => {
    installFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    render(<TasksApp />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No hemos podido conectar');
    expect(alert.textContent).not.toMatch(/Nest|caíd|apagad/i);
  });

  it('una respuesta del proxy que no es JSON muestra el código HTTP, sin suponer que la API está caída', async () => {
    installFetch(() => new Response('Bad Gateway', { status: 502 }));
    render(<TasksApp />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Algo ha salido mal. Inténtalo de nuevo en unos minutos.');
    expect(alert).not.toHaveTextContent(/502|Código/); // sin números de error
    expect(alert.textContent).not.toMatch(/Nest|caíd|apagad/i);
  });
});

describe('presentación de los errores', () => {
  it('un fallo pasajero (5xx) ofrece «Reintentar», sin código interno ni detalles técnicos', async () => {
    installFetch(() => errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor'));
    render(<TasksApp />);
    const alert = await screen.findByRole('alert');

    expect(within(alert).getByText('No se pudieron cargar las tareas.')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(alert).not.toHaveTextContent(/INTERNAL_ERROR|Referencia|stack|at \w+\.|Error interno/i);
  });

  it('un error que repetir no arregla (404) NO ofrece «Reintentar»: ofrece recargar y no muestra ningún código', async () => {
    installFetch(() => errorResponse(404, 'ROUTE_NOT_FOUND', 'Ruta no encontrada'));
    render(<TasksApp />);
    const alert = await screen.findByRole('alert');

    expect(within(alert).queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Recargar la página' })).toBeInTheDocument();
    expect(alert).not.toHaveTextContent(/ROUTE_NOT_FOUND|Referencia|404|Código/);
    expect(within(alert).getByText('No se pudieron cargar las tareas.')).toBeInTheDocument();
  });

  it('con UNA acción, el botón va en su propia columna (a la derecha) y su nombre accesible sigue siendo «Reintentar»', async () => {
    installFetch(() => errorResponse(500, 'INTERNAL_ERROR', 'x'));
    render(<TasksApp />);
    const alert = await screen.findByRole('alert');

    expect(alert).toHaveClass('alert-has-action');
    const retry = within(alert).getByRole('button', { name: 'Reintentar' }); // el icono es decorativo
    expect(retry.closest('.alert-action')).not.toBeNull();
    expect(retry.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('con VARIAS acciones (creación sin confirmar), los botones siguen debajo del texto', async () => {
    const user = userEvent.setup();
    installFetch(({ method }) =>
      method === 'POST' ? errorResponse(500, 'INTERNAL_ERROR', 'x') : jsonResponse([]),
    );
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);
    await fillForm(user, 'Tarea', 'Marta');
    await user.click(createButton());

    const notice = (await screen.findByText(/No se pudo confirmar/)).closest('.alert');
    expect(notice).not.toHaveClass('alert-has-action');
    expect(within(notice as HTMLElement).getByRole('button', { name: 'Cerrar aviso' }).closest('.alert-actions')).not.toBeNull();
  });

  it('la alerta es accesible por teclado: «Reintentar» se enfoca con Tab y se activa con Enter', async () => {
    const user = userEvent.setup();
    let fail = true;
    installFetch(() => (fail ? errorResponse(500, 'INTERNAL_ERROR', 'x') : jsonResponse([demo])));
    render(<TasksApp />);
    await screen.findByRole('alert');

    const retry = screen.getByRole('button', { name: 'Reintentar' });
    retry.focus();
    expect(retry).toHaveFocus();
    fail = false;
    await user.keyboard('{Enter}');

    // Recuperación: desaparece el error y aparece la lista.
    expect(await screen.findByText('Preparar demo')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('área de estado de la lista (carga y error)', () => {
  it('cargando: cabecera de la tabla, área amplia con indicador y texto, sin filas', () => {
    installFetch(() => deferred<Response>().promise);
    const { container } = render(<TasksApp />);

    expect(container.querySelector('.task-list-head')).toHaveAttribute('aria-hidden', 'true');
    const area = container.querySelector('.list-state');
    expect(area).not.toBeNull();
    const status = within(area as HTMLElement).getByRole('status');
    expect(status).toHaveTextContent('Cargando tareas…');
    expect(status.querySelector('.spinner')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('error: recuadro centrado en la MISMA área, con cabecera y sin filas; «Reintentar» recupera los datos', async () => {
    const user = userEvent.setup();
    let fail = true;
    installFetch(() => (fail ? errorResponse(500, 'INTERNAL_ERROR', 'x') : jsonResponse([demo])));
    const { container } = render(<TasksApp />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('alert-centered');
    expect(alert.closest('.list-state')).not.toBeNull();
    expect(container.querySelector('.task-list-head')).not.toBeNull();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();

    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Preparar demo' })).toBeInTheDocument();
    expect(container.querySelector('.list-state')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('si falla la carga tras cambiar de filtro (la lista anterior ya no vale), aparece el recuadro centrado', async () => {
    const user = userEvent.setup();
    let fail = false;
    installFetch(() => (fail ? errorResponse(500, 'INTERNAL_ERROR', 'x') : jsonResponse([demo])));
    render(<TasksApp />);
    await screen.findByRole('heading', { name: 'Preparar demo' });

    fail = true;
    await user.selectOptions(filterSelect(), 'pending');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron cargar las tareas.'); // al cambiar de filtro no hay datos válidos
    expect(alert).toHaveClass('alert-centered');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});

describe('recarga con la lista visible (indicador superpuesto)', () => {
  /** Lista cargada; el siguiente GET queda pendiente hasta que el test lo resuelva. */
  async function setupReload() {
    const user = userEvent.setup();
    const reload = deferred<Response>();
    let gets = 0;
    const net = installFetch(({ method }) => {
      if (method === 'PATCH') return jsonResponse({ ...demo, status: 'in_progress' });
      gets += 1;
      return gets === 1 ? jsonResponse([demo]) : reload.promise;
    });
    const { container } = render(<TasksApp />);
    await screen.findByRole('heading', { name: 'Preparar demo' });
    await chooseStatus(user, 'En curso'); // tras el PATCH, la lista se recarga
    await waitFor(() => expect(net.gets()).toHaveLength(2));
    return { container, reload };
  }
  const overlay = (c: HTMLElement) => c.querySelector('.refresh-overlay');

  it('mientras recarga: indicador visible, filas atenuadas, lista ocupada y «Actualizando…» solo para lectores', async () => {
    const { container, reload } = await setupReload();

    expect(overlay(container)).toHaveClass('is-visible');
    expect(overlay(container)).toHaveAttribute('aria-hidden', 'true');
    expect(overlay(container)?.querySelector('.spinner')).not.toBeNull();
    expect(container.querySelector('.task-table')).toHaveClass('is-refreshing');
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
    const status = screen.getAllByRole('status').find((s) => s.textContent === 'Actualizando…');
    expect(status).toHaveClass('sr-only');
    // Sin texto visible en la cabecera: solo la cantidad de registros.
    expect(container.querySelector('.card-count')).toHaveTextContent(/^1 registro$/);
    // Las filas siguen ahí (no se ocultan ni se sustituyen por el área de carga).
    expect(screen.getByRole('heading', { name: 'Preparar demo' })).toBeInTheDocument();
    expect(container.querySelector('.list-state')).toBeNull();

    reload.resolve(jsonResponse([{ ...demo, status: 'in_progress' }]));
    await screen.findByText('En curso', { selector: '.badge' });
  });

  it('«Cambiar» se bloquea durante la recarga sin perder el foco, y se libera al terminar', async () => {
    const { reload } = await setupReload();
    const trigger = statusTrigger();

    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).not.toBeDisabled(); // aria-disabled: sigue pudiendo tener el foco
    trigger.focus();
    expect(trigger).toHaveFocus();
    trigger.click();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument(); // no abre el menú con datos viejos

    reload.resolve(jsonResponse([{ ...demo, status: 'in_progress' }]));
    await waitFor(() => expect(statusTrigger()).not.toHaveAttribute('aria-disabled'));
    expect(statusTrigger()).toHaveFocus();
  });

  it('los datos se actualizan EN CUANTO llegan; el indicador sigue ~1 s y luego desaparece', async () => {
    const { container, reload } = await setupReload();
    const shownAt = Date.now();

    reload.resolve(jsonResponse([{ ...demo, status: 'in_progress' }]));
    // Datos ya pintados y la lista deja de estar ocupada…
    expect(await screen.findByText('En curso', { selector: '.badge' })).toBeInTheDocument();
    expect(screen.getByRole('list')).not.toHaveAttribute('aria-busy');
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Actualizando…')).toBe(false);
    // …pero el indicador se mantiene hasta completar el segundo mínimo.
    expect(overlay(container)).toHaveClass('is-visible');

    await waitFor(() => expect(overlay(container)).not.toHaveClass('is-visible'), { timeout: 2000 });
    expect(Date.now() - shownAt).toBeGreaterThanOrEqual(950);
    expect(container.querySelector('.task-table')).not.toHaveClass('is-refreshing');
  });
});

describe('respuestas antiguas', () => {
  it('una respuesta lenta del filtro anterior NO sobrescribe la del filtro más reciente', async () => {
    const user = userEvent.setup();
    const all = deferred<Response>();
    const done = deferred<Response>();
    installFetch(({ url }) => (url === '/api/tasks' ? all.promise : done.promise));
    render(<TasksApp />); // lanza GET /api/tasks (queda pendiente)

    await user.selectOptions(filterSelect(), 'done'); // lanza GET ?status=done

    // La respuesta MÁS RECIENTE llega primero…
    done.resolve(jsonResponse([review]));
    expect(await screen.findByText('Revisar PR')).toBeInTheDocument();

    // …y después llega la ANTIGUA, con otro contenido. No debe pisarla.
    all.resolve(jsonResponse([demo, review]));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByText('Preparar demo')).not.toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
    expect(filterSelect()).toHaveValue('done');
  });
});

describe('crear una tarea', () => {
  it('envía los datos recortados, vacía el formulario y confirma la creación', async () => {
    const user = userEvent.setup();
    const created = makeTask({ id: 9, title: 'Comprar leche', assignee: 'Marta' });
    let posted = false;
    const net = installFetch(({ method }) => {
      if (method === 'POST') {
        posted = true;
        return jsonResponse(created, 201);
      }
      return jsonResponse(posted ? [created] : []); // la lista solo contiene la tarea DESPUÉS de crearla
    });
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);

    await fillForm(user, '  Comprar leche  ', ' Marta ');
    await user.click(createButton());

    expect(await screen.findByText(/Tarea «Comprar leche» creada como Pendiente\./)).toBeInTheDocument();
    expect(net.posts()).toEqual([
      { method: 'POST', url: '/api/tasks', body: { title: 'Comprar leche', assignee: 'Marta' } },
    ]);
    expect(screen.getByLabelText('Título')).toHaveValue('');
    expect(screen.getByLabelText('Responsable')).toHaveValue('');
    // Tras crear, el panel se cierra y el foco vuelve al botón «Nueva tarea».
    expect(panel().closest('.panel-layer')).not.toHaveClass('is-open');
    expect(newTaskButton()).toHaveFocus();
    // La lista se recargó tras crear y ahora muestra la tarea nueva.
    expect(await screen.findByRole('heading', { name: 'Comprar leche' })).toBeInTheDocument();
    expect(net.gets().length).toBeGreaterThanOrEqual(2);
  });

  it('con otro filtro activo avisa de que la tarea nueva (pendiente) no se ve, y ofrece verla', async () => {
    const user = userEvent.setup();
    const net = installFetch(({ method }) =>
      method === 'POST' ? jsonResponse(makeTask({ id: 9, title: 'Comprar leche' }), 201) : jsonResponse([]),
    );
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);
    await user.selectOptions(filterSelect(), 'done');
    await screen.findByText(/No hay tareas con el estado/);

    await fillForm(user);
    await user.click(createButton());

    expect(await screen.findByText(/No aparece con el filtro actual\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver pendientes' }));
    await waitFor(() => expect(net.gets().at(-1)?.url).toBe('/api/tasks?status=pending'));
    expect(filterSelect()).toHaveValue('pending');
  });

  it('un rechazo seguro del servidor (400) conserva lo escrito y lo muestra en su campo, sin aviso de «no confirmada»', async () => {
    const user = userEvent.setup();
    installFetch(({ method }) =>
      method === 'POST'
        ? errorResponse(400, 'VALIDATION_ERROR', 'Datos inválidos', [
            { path: 'assignee', message: 'El servidor no acepta este responsable' },
          ])
        : jsonResponse([]),
    );
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);

    await fillForm(user, 'Tarea', 'Raro');
    await user.click(createButton());

    expect(await screen.findByText('El servidor no acepta este responsable')).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Tarea');
    expect(screen.getByLabelText('Responsable')).toHaveValue('Raro');
    expect(screen.queryByText(/No se pudo confirmar/)).not.toBeInTheDocument();
  });

  it('evita envíos duplicados: el botón se deshabilita mientras la petición está en curso', async () => {
    const user = userEvent.setup();
    const post = deferred<Response>();
    const net = installFetch(({ method }) => (method === 'POST' ? post.promise : jsonResponse([])));
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);

    await fillForm(user);
    await user.click(createButton());
    const busy = await screen.findByRole('button', { name: 'Creando…' });
    expect(busy).toBeDisabled();
    await user.click(busy); // un segundo clic no hace nada
    await user.keyboard('{Enter}');

    post.resolve(jsonResponse(makeTask({ id: 5 }), 201));
    await screen.findByText(/creada como Pendiente/);
    expect(net.posts()).toHaveLength(1);
  });

  it('si la creación se confirma pero falla la recarga, mantiene la confirmación y «Reintentar» solo recarga la lista', async () => {
    const user = userEvent.setup();
    let created = false;
    let listWorks = false;
    const net = installFetch(({ method }) => {
      if (method === 'POST') {
        created = true;
        return jsonResponse(makeTask({ id: 9, title: 'Comprar leche' }), 201);
      }
      return created && !listWorks
        ? errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor')
        : jsonResponse(created ? [makeTask({ id: 9, title: 'Comprar leche' })] : []);
    });
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);

    await fillForm(user);
    await user.click(createButton());

    // La creación SE CONFIRMA aunque la recarga falle…
    expect(await screen.findByText(/Tarea «Comprar leche» creada como Pendiente\./)).toBeInTheDocument();
    // …y la lista muestra su propio error.
    expect(await screen.findByText(/No se pudo actualizar la lista\./)).toBeInTheDocument();
    expect(screen.queryByText(/No se pudo confirmar/)).not.toBeInTheDocument();

    listWorks = true;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Comprar leche' })).toBeInTheDocument();
    expect(net.posts()).toHaveLength(1); // reintentar la carga NO vuelve a crear
  });
});

describe('creación sin confirmar (5xx, red, respuesta inesperada)', () => {
  const unconfirmedMessage = /No se pudo confirmar si la tarea se creó\./;

  async function submitWithFailingPost(post: () => Response | Promise<Response>) {
    const user = userEvent.setup();
    const net = installFetch(({ method }) => (method === 'POST' ? post() : jsonResponse([])));
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);
    await fillForm(user, 'Tarea', 'Marta');
    await user.click(createButton());
    await screen.findByText(unconfirmedMessage);
    return { user, net };
  }

  it.each([
    ['un 500 con el formato acordado', () => errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor')],
    ['un 404 (no prueba que no se guardara)', () => errorResponse(404, 'ROUTE_NOT_FOUND', 'Ruta no encontrada')],
    ['un 502 que no es JSON', () => new Response('Bad Gateway', { status: 502 })],
    ['un 201 con un cuerpo inválido', () => jsonResponse({ nope: true }, 201)],
    [
      'un fallo de red',
      () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('%s deja la creación SIN CONFIRMAR', async (_name, post) => {
    await submitWithFailingPost(post);
    // Aviso visible, datos conservados y reenvío con los mismos datos solo tras confirmación explícita.
    expect(screen.getByText(unconfirmedMessage)).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Tarea');
    expect(screen.getByRole('button', { name: 'Ya revisé la lista, crear de nuevo' })).toBeInTheDocument();
  });

  it('conserva los datos, recarga la lista y exige confirmación explícita para reenviar los mismos datos', async () => {
    const { user, net } = await submitWithFailingPost(() =>
      errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor'),
    );

    // Datos conservados y lista recargada (sin tomar la recarga como prueba).
    expect(screen.getByLabelText('Título')).toHaveValue('Tarea');
    expect(screen.getByLabelText('Responsable')).toHaveValue('Marta');
    await waitFor(() => expect(net.gets().length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText(/no prueba por sí solo qué ocurrió con el envío/)).toBeInTheDocument();

    // Con los MISMOS datos, el botón exige la confirmación explícita.
    expect(screen.getByRole('button', { name: 'Ya revisé la lista, crear de nuevo' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^Crear tarea$/ })).not.toBeInTheDocument();
    // No hay ningún atajo «reenviar».
    expect(screen.queryByRole('button', { name: /reenviar|reintentar envío/i })).not.toBeInTheDocument();
    expect(net.posts()).toHaveLength(1);
  });

  it('el aviso NO afirma que la lista se haya recargado: si la recarga falla, la lista muestra su propio error', async () => {
    const user = userEvent.setup();
    installFetch(({ method }) =>
      method === 'POST'
        ? errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor')
        : jsonResponse([]), // el listado inicial funciona…
    );
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);
    // …pero a partir de ahora la API deja de responder: la recarga posterior a la creación fallará.
    installFetch(({ method }) =>
      method === 'POST' ? errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor') : errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor'),
    );

    await fillForm(user, 'Tarea', 'Marta');
    await user.click(createButton());

    expect(await screen.findByText(unconfirmedMessage)).toBeInTheDocument();
    expect(await screen.findByText(/No se pudo actualizar la lista\./)).toBeInTheDocument();
    // Antes decía «La lista se ha recargado», y a la vez la lista mostraba que NO se había podido recargar.
    expect(screen.queryByText(/se ha recargado/i)).not.toBeInTheDocument();
  });

  it('el aviso NO se cierra solo: ni al recargar la lista ni tras un envío posterior; solo lo cierra el usuario', async () => {
    const { user, net } = await submitWithFailingPost(() =>
      errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor'),
    );

    await user.click(screen.getByRole('button', { name: 'Ver todas las tareas' })); // recarga la lista
    await waitFor(() => expect(net.gets().length).toBeGreaterThanOrEqual(3));
    expect(screen.getByText(unconfirmedMessage)).toBeInTheDocument();

    // Un segundo envío (con los mismos datos, tras confirmar) que sí es rechazado por el servidor
    // NO demuestra nada sobre el primero: el aviso sigue ahí.
    await user.click(screen.getByRole('button', { name: 'Ya revisé la lista, crear de nuevo' }));
    await waitFor(() => expect(net.posts()).toHaveLength(2));
    expect(screen.getByText(unconfirmedMessage)).toBeInTheDocument();
    expect(screen.getByText('Hay 2 envíos sin confirmar.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByText(unconfirmedMessage)).not.toBeInTheDocument();
  });

  it('si el usuario cambia algún campo, el botón vuelve a «Crear tarea» y se advierte de la posible tarea adicional', async () => {
    const { user } = await submitWithFailingPost(() =>
      errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor'),
    );

    await user.type(screen.getByLabelText('Título'), ' v2');

    expect(screen.getByRole('button', { name: 'Crear tarea' })).toBeEnabled();
    expect(screen.getByText(/creará una tarea adicional/)).toBeInTheDocument();
    expect(screen.getByText(unconfirmedMessage)).toBeInTheDocument();

    // Volver a los mismos datos restablece la confirmación explícita.
    await user.clear(screen.getByLabelText('Título'));
    await user.type(screen.getByLabelText('Título'), 'Tarea');
    expect(screen.getByRole('button', { name: 'Ya revisé la lista, crear de nuevo' })).toBeInTheDocument();
  });
});

describe('accesibilidad del formulario y de los avisos', () => {
  it('marca los campos como obligatorios', async () => {
    const user = userEvent.setup();
    installFetch(() => jsonResponse([]));
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);
    await openPanel(user);

    expect(screen.getByLabelText('Título')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText('Responsable')).toHaveAttribute('aria-required', 'true');
    expect(screen.getAllByText(/^Obligatorio\./)).toHaveLength(2);
  });

  it('la región aria-live existe desde el principio y es la MISMA cuando aparece la confirmación', async () => {
    const user = userEvent.setup();
    installFetch(({ method }) =>
      method === 'POST' ? jsonResponse(makeTask({ id: 9, title: 'Comprar leche' }), 201) : jsonResponse([]),
    );
    const { container } = render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);

    const before = container.querySelector('[aria-live="polite"]');
    expect(before).not.toBeNull(); // ya está en el DOM, vacía, ANTES de que cambie su contenido
    expect(before).toBeEmptyDOMElement();
    expect(before).not.toHaveAttribute('hidden');

    await fillForm(user);
    await user.click(createButton());
    await screen.findByText(/Tarea «Comprar leche» creada como Pendiente\./);

    const after = container.querySelector('[aria-live="polite"]');
    expect(after).toBe(before); // el mismo elemento: el lector de pantalla anuncia el cambio
    expect(after).toHaveTextContent('Tarea «Comprar leche» creada');
  });

  it('dos tareas seguidas con el MISMO título vuelven a anunciarse: el aviso se monta de nuevo', async () => {
    const user = userEvent.setup();
    let nextId = 9;
    installFetch(({ method }) =>
      method === 'POST' ? jsonResponse(makeTask({ id: nextId++, title: 'Comprar leche' }), 201) : jsonResponse([]),
    );
    const { container } = render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);
    const region = container.querySelector('[aria-live="polite"]');

    await fillForm(user);
    await user.click(createButton());
    const first = (await screen.findByText(/Tarea «Comprar leche» creada/)).closest('.notice');
    expect(first).not.toBeNull();

    await fillForm(user); // el mismo título otra vez
    await user.click(createButton());
    await waitFor(() => expect(container.querySelector('[aria-live="polite"] .notice')).not.toBe(first));

    const second = container.querySelector('[aria-live="polite"] .notice');
    expect(second).not.toBeNull();
    expect(second).not.toBe(first); // un nodo NUEVO dentro de la misma región: el lector de pantalla lo anuncia
    expect(container.querySelector('[aria-live="polite"]')).toBe(region);
    expect(second).toHaveTextContent('Tarea «Comprar leche» creada como Pendiente.');
  });

  it('el CSS no oculta la región aria-live con display:none (la sacaría del árbol de accesibilidad)', () => {
    const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8');
    const hidingRules = [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)].filter(
      ([, selector, body]) => /\.live\b/.test(selector) && /display\s*:\s*none/.test(body),
    );
    expect(hidingRules).toEqual([]);
  });

  it('si el servidor rechaza un campo, el foco va a ese campo', async () => {
    const user = userEvent.setup();
    installFetch(({ method }) =>
      method === 'POST'
        ? errorResponse(400, 'VALIDATION_ERROR', 'Datos inválidos', [
            { path: 'assignee', message: 'El servidor no acepta este responsable' },
          ])
        : jsonResponse([]),
    );
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);

    await fillForm(user, 'Tarea', 'Raro');
    await user.click(createButton());

    const field = screen.getByLabelText('Responsable');
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('El servidor no acepta este responsable');
  });

  it('si el rechazo del servidor es del título, el foco va al título', async () => {
    const user = userEvent.setup();
    installFetch(({ method }) =>
      method === 'POST'
        ? errorResponse(400, 'VALIDATION_ERROR', 'Datos inválidos', [{ path: 'title', message: 'Título no válido' }])
        : jsonResponse([]),
    );
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);

    await fillForm(user, 'Tarea', 'Marta');
    await user.click(createButton());

    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveFocus());
  });
});

const statusTrigger = () => screen.getByRole('button', { name: /^Cambiar estado de la tarea/ });

/** El cambio de estado es un menú desplegable: se abre con «Cambiar» y se elige una opción. */
async function chooseStatus(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(statusTrigger());
  await user.click(screen.getByRole('menuitem', { name: new RegExp(`Marcar como ${label}`) }));
}

describe('cambiar el estado de una tarea', () => {
  it('el menú ofrece una opción por cada OTRO estado, con nombre accesible que incluye la tarea', async () => {
    const user = userEvent.setup();
    installFetch(() => jsonResponse([demo]));
    render(<TasksApp />);
    await screen.findByText('Preparar demo');

    // Cerrado: solo el botón, y declara que abre un menú.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(statusTrigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(statusTrigger()).toHaveAttribute('aria-expanded', 'false');

    await user.click(statusTrigger());
    expect(statusTrigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Cambiar el estado de «Preparar demo»' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Marcar como En curso la tarea «Preparar demo»' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Marcar como Hecha la tarea «Preparar demo»' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Marcar como Pendiente/ })).not.toBeInTheDocument();
  });

  it('llama a PATCH, deshabilita el botón de esa tarea mientras dura y recarga la lista', async () => {
    const user = userEvent.setup();
    const patch = deferred<Response>();
    const net = installFetch(({ method }) => (method === 'PATCH' ? patch.promise : jsonResponse([demo])));
    render(<TasksApp />);
    await screen.findByText('Preparar demo');

    const button = statusTrigger();
    await chooseStatus(user, 'En curso');

    expect(net.patches()).toEqual([
      { method: 'PATCH', url: '/api/tasks/1/status', body: { status: 'in_progress' } },
    ]);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument(); // elegir una opción cierra el menú
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByText('Guardando…')).toBeInTheDocument();

    const getsBefore = net.gets().length;
    patch.resolve(jsonResponse({ ...demo, status: 'in_progress' }));
    await waitFor(() => expect(net.gets().length).toBe(getsBefore + 1));
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('un error al cambiar el estado se muestra junto a la tarea', async () => {
    const user = userEvent.setup();
    installFetch(({ method }) =>
      method === 'PATCH' ? errorResponse(500, 'INTERNAL_ERROR', 'Error interno del servidor') : jsonResponse([demo]),
    );
    render(<TasksApp />);
    await screen.findByText('Preparar demo');

    await chooseStatus(user, 'Hecha');

    const item = screen.getByRole('listitem');
    expect(await within(item).findByRole('alert')).toHaveTextContent('Algo ha fallado de nuestro lado');
  });

  it('si la mutación termina justo cuando el usuario cambia de filtro, la recarga usa el filtro VIGENTE', async () => {
    const user = userEvent.setup();
    const patch = deferred<Response>();
    const net = installFetch(({ method }) => (method === 'PATCH' ? patch.promise : jsonResponse([demo])));
    render(<TasksApp />);
    await screen.findByText('Preparar demo');

    await chooseStatus(user, 'En curso'); // PATCH pendiente
    await user.selectOptions(filterSelect(), 'pending'); // el usuario cambia de filtro mientras tanto
    await waitFor(() => expect(net.gets().at(-1)?.url).toBe('/api/tasks?status=pending'));

    const before = net.calls.length;
    patch.resolve(jsonResponse({ ...demo, status: 'in_progress' }));
    await waitFor(() => expect(net.calls.length).toBeGreaterThan(before));

    // Todas las peticiones posteriores a la mutación usan el filtro nuevo, nunca el antiguo.
    const after: Call[] = net.calls.slice(before);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((c) => c.method === 'GET' && c.url === '/api/tasks?status=pending')).toBe(true);
    expect(filterSelect()).toHaveValue('pending');
  });
});

describe('menú de estado: teclado y cierre', () => {
  async function setup() {
    const user = userEvent.setup();
    installFetch(() => jsonResponse([demo]));
    render(<TasksApp />);
    await screen.findByText('Preparar demo');
    return user;
  }

  it('↓ abre el menú y enfoca la primera opción; ↑ ↓ se mueven de forma circular', async () => {
    const user = await setup();
    statusTrigger().focus();
    await user.keyboard('{ArrowDown}');
    const [first, second] = screen.getAllByRole('menuitem');
    expect(first).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{ArrowDown}'); // del último pasa al primero
    expect(first).toHaveFocus();
    await user.keyboard('{ArrowUp}'); // del primero pasa al último
    expect(second).toHaveFocus();
    await user.keyboard('{Home}');
    expect(first).toHaveFocus();
    await user.keyboard('{End}');
    expect(second).toHaveFocus();
  });

  it('↑ desde el botón abre el menú en la última opción', async () => {
    const user = await setup();
    statusTrigger().focus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('menuitem').at(-1)).toHaveFocus();
  });

  it('Escape cierra el menú y devuelve el foco al botón', async () => {
    const user = await setup();
    await user.click(statusTrigger());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(statusTrigger()).toHaveFocus();
    expect(statusTrigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('un clic fuera cierra el menú', async () => {
    const user = await setup();
    await user.click(statusTrigger());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('heading', { name: 'Tareas' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Enter sobre una opción cambia el estado', async () => {
    const user = userEvent.setup();
    const net = installFetch(({ method }) => (method === 'PATCH' ? jsonResponse(demo) : jsonResponse([demo])));
    render(<TasksApp />);
    await screen.findByText('Preparar demo');
    statusTrigger().focus();
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(net.patches()).toHaveLength(1));
    expect(net.patches()[0]).toMatchObject({ body: { status: 'in_progress' } });
  });
});

describe('panel lateral «Nueva tarea»', () => {
  it('está cerrado al inicio, se abre con el botón y lleva el foco al primer campo', async () => {
    const user = userEvent.setup();
    installFetch(() => jsonResponse([]));
    const { container } = render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);

    const layer = container.querySelector('.panel-layer');
    expect(layer).not.toHaveClass('is-open');
    expect(layer).toHaveAttribute('inert');

    await openPanel(user);
    expect(layer).toHaveClass('is-open');
    expect(layer).not.toHaveAttribute('inert');
    expect(screen.getByRole('dialog', { name: 'Nueva tarea' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Título')).toHaveFocus();
  });

  it('Escape cierra el panel, devuelve el foco al botón y conserva el borrador', async () => {
    const user = userEvent.setup();
    installFetch(() => jsonResponse([]));
    const { container } = render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);

    await openPanel(user);
    await user.type(screen.getByLabelText('Título'), 'Borrador');
    await user.keyboard('{Escape}');

    expect(container.querySelector('.panel-layer')).not.toHaveClass('is-open');
    expect(newTaskButton()).toHaveFocus();

    await openPanel(user);
    expect(screen.getByLabelText('Título')).toHaveValue('Borrador');
  });

  it('el botón «Cerrar panel» también cierra', async () => {
    const user = userEvent.setup();
    installFetch(() => jsonResponse([]));
    const { container } = render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);

    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Cerrar panel' }));
    expect(container.querySelector('.panel-layer')).not.toHaveClass('is-open');
  });

  it('Tab no sale del panel: del último control vuelve al primero', async () => {
    const user = userEvent.setup();
    installFetch(() => jsonResponse([]));
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);

    await openPanel(user);
    createButton().focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cerrar panel' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(createButton()).toHaveFocus();
  });
});

describe('panel: contadores y cancelar', () => {
  it('muestra los contadores 0/120 y 0/60, y los actualiza al escribir', async () => {
    const user = userEvent.setup();
    installFetch(() => jsonResponse([]));
    render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);
    await openPanel(user);

    expect(screen.getByText(/^0\/120/)).toBeInTheDocument();
    expect(screen.getByText(/^0\/60/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Título'), 'Hola');
    await user.type(screen.getByLabelText('Responsable'), 'Ana');
    expect(screen.getByText(/^4\/120/)).toBeInTheDocument();
    expect(screen.getByText(/^3\/60/)).toBeInTheDocument();
  });

  it('«Cancelar» cierra el panel sin enviar nada, devuelve el foco y conserva el borrador', async () => {
    const user = userEvent.setup();
    const net = installFetch(() => jsonResponse([]));
    const { container } = render(<TasksApp />);
    await screen.findByText(/Todavía no hay tareas/);
    await openPanel(user);
    await user.type(screen.getByLabelText('Título'), 'Borrador');

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(container.querySelector('.panel-layer')).not.toHaveClass('is-open');
    expect(newTaskButton()).toHaveFocus();
    expect(net.posts()).toHaveLength(0);
    await openPanel(user);
    expect(screen.getByLabelText('Título')).toHaveValue('Borrador');
  });
});

describe('buscador', () => {
  it('filtra por título o responsable en el navegador, sin nuevas peticiones, y cuenta los registros', async () => {
    const user = userEvent.setup();
    const net = installFetch(() => jsonResponse([demo, review]));
    render(<TasksApp />);
    await screen.findByText('Preparar demo');
    expect(screen.getByText('2 registros')).toBeInTheDocument();
    const calls = net.calls.length;

    await user.type(screen.getByLabelText('Buscar tarea'), 'luis');
    expect(screen.queryByText('Preparar demo')).not.toBeInTheDocument();
    expect(screen.getByText('Revisar PR')).toBeInTheDocument();
    expect(screen.getByText('1 registro')).toBeInTheDocument();
    expect(net.calls).toHaveLength(calls);

    await user.clear(screen.getByLabelText('Buscar tarea'));
    await user.type(screen.getByLabelText('Buscar tarea'), 'zzz');
    expect(await screen.findByText('Ninguna tarea coincide con «zzz».')).toBeInTheDocument();
  });
});

describe('lista: datos de cada fila', () => {
  it('cada celda lleva su etiqueta accesible (responsable, actualización y estado)', async () => {
    installFetch(() => jsonResponse([review]));
    render(<TasksApp />);
    const item = (await screen.findByRole('listitem')) as HTMLElement;
    expect(item).toHaveTextContent('Responsable: Luis');
    expect(item).toHaveTextContent('Actualizada:');
    expect(item).toHaveTextContent('Estado: Hecha');
  });
});
