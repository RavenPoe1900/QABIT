import { Module } from '@nestjs/common';
import { CLOCK, systemClock, type Clock } from '../../shared-kernel/clock';
import { ChangeTaskStatusUseCase } from './application/change-task-status.use-case';
import { CreateTaskUseCase } from './application/create-task.use-case';
import { ListTasksUseCase } from './application/list-tasks.use-case';
import { TASK_REPOSITORY, type TaskRepository } from './application/ports/task-repository.port';
import { TasksController } from './infrastructure/http/tasks.controller';
import { PrismaTaskRepository } from './infrastructure/persistence/prisma-task.repository';

/**
 * Módulo de composición: aquí (y solo aquí) se unen los puertos con sus adaptadores.
 * Los casos de uso son clases planas, sin decoradores de Nest.
 */
@Module({
  controllers: [TasksController],
  providers: [
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
    { provide: CLOCK, useValue: systemClock },
    {
      provide: ListTasksUseCase,
      inject: [TASK_REPOSITORY],
      useFactory: (tasks: TaskRepository) => new ListTasksUseCase(tasks),
    },
    {
      provide: CreateTaskUseCase,
      inject: [TASK_REPOSITORY, CLOCK],
      useFactory: (tasks: TaskRepository, clock: Clock) => new CreateTaskUseCase(tasks, clock),
    },
    {
      provide: ChangeTaskStatusUseCase,
      inject: [TASK_REPOSITORY, CLOCK],
      useFactory: (tasks: TaskRepository, clock: Clock) => new ChangeTaskStatusUseCase(tasks, clock),
    },
  ],
})
export class TasksModule {}
