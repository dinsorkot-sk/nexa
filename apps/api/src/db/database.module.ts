import { createClient } from '@libsql/client';
import { Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/libsql';
import { getDatabaseUrl } from './config';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client = createClient({ url: getDatabaseUrl() });

  readonly db = drizzle(this.client, { schema });

  onModuleDestroy(): void {
    this.client.close();
  }
}

@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
