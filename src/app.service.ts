import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const APP_NAME = 'Embedded widget platform';
export const APP_VERSION = '1.0';

export interface Endpoint {
  method: string;
  path: string;
  description: string;
}

const ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/', description: 'Platform info and endpoint list' },
  {
    method: 'GET',
    path: '/health',
    description: 'Health check (includes database ping)',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/register',
    description: 'Create an owner account',
  },
  { method: 'POST', path: '/api/v1/auth/login', description: 'Get a JWT' },
  {
    method: 'POST',
    path: '/api/v1/widgets',
    description: 'Create a widget (returns embed snippet)',
  },
  {
    method: 'GET',
    path: '/api/v1/widgets',
    description: "List the owner's widgets",
  },
  {
    method: 'GET',
    path: '/api/v1/widgets/:id',
    description: 'Read one widget (owner-scoped)',
  },
  {
    method: 'PATCH',
    path: '/api/v1/widgets/:id',
    description: 'Update one widget (owner-scoped)',
  },
  {
    method: 'DELETE',
    path: '/api/v1/widgets/:id',
    description: 'Delete one widget (owner-scoped)',
  },
];

@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}

  getInfo() {
    return {
      name: APP_NAME,
      version: APP_VERSION,
      endpoints: ENDPOINTS,
    };
  }

  async health(): Promise<{ status: string; db: string }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        error: {
          code: 'DB_UNAVAILABLE',
          message: 'database is unreachable',
        },
      });
    }
    return { status: 'ok', db: 'ok' };
  }
}
