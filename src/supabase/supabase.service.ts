import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Thin wrapper around the Supabase JS client.
 *
 * Two clients are exposed:
 * - `getClient()`      → anon key (browser/public, subject to Row Level Security)
 * - `getAdminClient()` → service-role key (server-only, bypasses RLS — never
 *                        expose it or use it on the client).
 *
 * Keys are read from the environment at first use, so the app can boot even
 * while the user is still filling in `.env`.
 */
@Injectable()
export class SupabaseService {
    private client?: SupabaseClient;
    private adminClient?: SupabaseClient;

    constructor(private readonly config: ConfigService) { }

    getClient(): SupabaseClient {
        this.client ??= createClient(
            this.readRequired('SUPABASE_URL'),
            this.readRequired('SUPABASE_ANON_KEY'),
        );
        return this.client;
    }

    getAdminClient(): SupabaseClient {
        this.adminClient ??= createClient(
            this.readRequired('SUPABASE_URL'),
            this.readRequired('SUPABASE_SERVICE_ROLE_KEY'),
            {
                auth: { autoRefreshToken: false, persistSession: false },
            },
        );
        return this.adminClient;
    }

    private readRequired(key: string): string {
        const value = this.config.get<string>(key);
        if (!value) {
            throw new Error(
                `Missing required environment variable "${key}". Add it to .env (see .env.example).`,
            );
        }
        return value;
    }
}
