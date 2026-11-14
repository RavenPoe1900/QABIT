import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../../generated/prisma/client';

/** Token de la URL de conexión (`file:/ruta/absoluta.db`). Los tests lo sustituyen. */
export const DB_URL = Symbol('DB_URL');

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(DB_URL) url: string) {
    super({ adapter: new PrismaBetterSqlite3({ url }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Cierra la conexión al parar la aplicación (requiere enableShutdownHooks en main.ts). */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
