import { Module } from '@nestjs/common';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { TasksModule } from './modules/tasks/tasks.module';

@Module({
  imports: [PrismaModule, TasksModule],
})
export class AppModule {}
