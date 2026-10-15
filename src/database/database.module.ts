import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        if (!databaseUrl) {
          throw new Error(
            'Missing required environment variable "DATABASE_URL". ' +
              'Add it to .env (see .env.example).',
          );
        }
        return {
          type: 'postgres',
          url: databaseUrl,
          autoLoadEntities: true,
          // Schema is owned by versioned migrations; apply pending ones on boot.
          synchronize: false,
          migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
          migrationsRun: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
