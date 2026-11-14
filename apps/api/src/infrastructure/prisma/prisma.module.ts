import { Global, Module } from '@nestjs/common';
import { ensureDbDir, resolveDbPath } from '../../config/env';
import { DB_URL, PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    {
      provide: DB_URL,
      useFactory: (): string => {
        const dbPath = resolveDbPath();
        ensureDbDir(dbPath);
        return `file:${dbPath}`;
      },
    },
    PrismaService,
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
