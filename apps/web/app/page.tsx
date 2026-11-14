import { TasksApp } from '../components/TasksApp';

// Componente de servidor: no necesita JavaScript en el cliente. Lo interactivo vive por
// debajo, en componentes con 'use client'. Los datos se piden desde el navegador (no se
// renderizan en el servidor), así que el HTML inicial no contiene tareas ni fechas.
export default function HomePage() {
  return (
    <main className="container">
      {/* El título visible de la pantalla es el de la tarjeta («Tareas»); el h1 se conserva para la estructura. */}
      <h1 className="sr-only">Gestor de tareas</h1>
      <TasksApp />
    </main>
  );
}
