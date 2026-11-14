import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, UseFilters } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createTaskSchema,
  listTasksQuerySchema,
  taskIdParamSchema,
  updateTaskStatusSchema,
  type CreateTaskInput,
  type ListTasksQuery,
  type Task as TaskDto,
  type UpdateTaskStatusRequest,
} from '@task-manager/shared';
import { ZodValidationPipe } from '../../../../infrastructure/http/zod-validation.pipe';
import { ChangeTaskStatusUseCase } from '../../application/change-task-status.use-case';
import { CreateTaskUseCase } from '../../application/create-task.use-case';
import { ListTasksUseCase } from '../../application/list-tasks.use-case';
import { TaskErrorsFilter } from './task-errors.filter';
import { ApiChangeTaskStatus, ApiCreateTask, ApiListTasks } from './tasks.api-docs';
import { presentTask } from './task.presenter';

/**
 * Adaptador HTTP de entrada: valida con los esquemas del contrato (frontera de transporte),
 * traduce a la entrada de los casos de uso y presenta el resultado. No contiene reglas de
 * negocio. Los tipos del contrato (`@task-manager/shared`) solo existen en esta capa; el
 * dominio tiene los suyos y TypeScript comprueba aquí que son compatibles.
 */
@ApiTags('tasks')
@UseFilters(TaskErrorsFilter)
@Controller('tasks')
export class TasksController {
  constructor(
    @Inject(ListTasksUseCase) private readonly listTasks: ListTasksUseCase,
    @Inject(CreateTaskUseCase) private readonly createTask: CreateTaskUseCase,
    @Inject(ChangeTaskStatusUseCase) private readonly changeTaskStatus: ChangeTaskStatusUseCase,
  ) {}

  @Get()
  @ApiListTasks()
  async list(
    @Query(new ZodValidationPipe(listTasksQuerySchema, '(query)')) query: ListTasksQuery,
  ): Promise<TaskDto[]> {
    const tasks = await this.listTasks.execute({ status: query.status });
    return tasks.map(presentTask);
  }

  @Post()
  @HttpCode(201)
  @ApiCreateTask()
  async create(
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
  ): Promise<TaskDto> {
    const task = await this.createTask.execute({ title: body.title, assignee: body.assignee });
    return presentTask(task);
  }

  @Patch(':id/status')
  @ApiChangeTaskStatus()
  async changeStatus(
    @Param('id', new ZodValidationPipe(taskIdParamSchema, 'id')) id: number,
    @Body(new ZodValidationPipe(updateTaskStatusSchema)) body: UpdateTaskStatusRequest,
  ): Promise<TaskDto> {
    const task = await this.changeTaskStatus.execute(id, body.status);
    return presentTask(task);
  }
}
