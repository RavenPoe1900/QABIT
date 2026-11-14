import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import type { TaskRepository } from '../../application/ports/task-repository.port';
import type { NewTask, Task } from '../../domain/task';
import { isTaskStatus, type TaskStatus } from '../../domain/task-status';

interface TaskRow {
  id: number;
  title: string;
  assignee: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convierte una fila de SQLite al modelo del DOMINIO. Si la base contuviera un estado que el
 * dominio no conoce, falla (la API responderá 500 y lo registrará en el log).
 */
function toTask(row: TaskRow): Task {
  if (!isTaskStatus(row.status)) {
    throw new Error(`Estado de tarea desconocido en la base de datos: ${row.status}`);
  }
  return {
    id: row.id,
    title: row.title,
    assignee: row.assignee,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** P2025: «el registro que se iba a actualizar no existe (o no cumple el filtro)». */
function isRecordNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2025';
}

/** Adaptador de persistencia. Solo usa la API de Prisma (consultas parametrizadas, sin SQL en crudo). */
@Injectable()
export class PrismaTaskRepository implements TaskRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(filter: { status?: TaskStatus }): Promise<Task[]> {
    const rows = await this.prisma.task.findMany({
      where: filter.status ? { status: filter.status } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toTask);
  }

  async findById(id: number): Promise<Task | null> {
    const row = await this.prisma.task.findUnique({ where: { id } });
    return row ? toTask(row) : null;
  }

  async create(task: NewTask): Promise<Task> {
    // Se guarda exactamente lo que construyó el dominio, incluido el estado inicial.
    const row = await this.prisma.task.create({
      data: {
        title: task.title,
        assignee: task.assignee,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    });
    return toTask(row);
  }

  async updateStatusIfUnchanged(
    id: number,
    expected: TaskStatus,
    next: TaskStatus,
    updatedAt: Date,
  ): Promise<Task | null> {
    try {
      // Un único UPDATE … WHERE id = ? AND status = ?: la comprobación y la escritura son atómicas.
      const row = await this.prisma.task.update({
        where: { id, status: expected },
        data: { status: next, updatedAt },
      });
      return toTask(row);
    } catch (error) {
      if (isRecordNotFound(error)) {
        return null; // no existe, o su estado ya no es `expected`
      }
      throw error;
    }
  }
}
