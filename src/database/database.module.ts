import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

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
          synchronize: config.get<string>('NODE_ENV') !== 'production',
        };
      },
    }),
  ],
})
export class DatabaseModule {}
