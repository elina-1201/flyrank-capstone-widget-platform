import request from 'supertest';
import { TestApp } from './test-app';

export interface OwnerCredentials {
    name: string;
    email: string;
    password: string;
}

let counter = 0;

/** Unique credentials per call so tests never collide on the owners.email UNIQUE. */
export function uniqueOwner(overrides: Partial<OwnerCredentials> = {}): OwnerCredentials {
    counter += 1;
    return {
        name: `Owner ${counter}`,
        email: `owner${counter}.${Date.now()}@example.com`,
        password: 'password123',
        ...overrides,
    };
}

/** Registers an owner and returns the credentials used. */
export async function registerOwner(
    app: TestApp,
    overrides: Partial<OwnerCredentials> = {},
): Promise<OwnerCredentials> {
    const creds = uniqueOwner(overrides);
    await request(app.app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(creds)
        .expect(201);
    return creds;
}

/** Registers (if needed) and logs in, returning a Bearer token. */
export async function loginOwner(
    app: TestApp,
    creds: OwnerCredentials,
): Promise<string> {
    const res = await request(app.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: creds.email, password: creds.password })
        .expect(200);
    return res.body.token as string;
}

/** Convenience: register + login in one step, returning `{ creds, token }`. */
export async function createOwnerWithToken(
    app: TestApp,
    overrides: Partial<OwnerCredentials> = {},
): Promise<{ creds: OwnerCredentials; token: string }> {
    const creds = await registerOwner(app, overrides);
    const token = await loginOwner(app, creds);
    return { creds, token };
}

export interface WidgetPayload {
    type: string;
    title: string;
    fields: Array<{
        name: string;
        label: string;
        type: string;
        required: boolean;
        placeholder?: string;
    }>;
    description?: string;
    buttonText?: string;
    displayOptions?: Record<string, unknown>;
}

/** A valid signup-form widget body with one required email field. */
export function widgetPayload(overrides: Partial<WidgetPayload> = {}): WidgetPayload {
    return {
        type: 'signup_form',
        title: 'Join our newsletter',
        fields: [
            { name: 'email', label: 'Email', type: 'email', required: true },
        ],
        ...overrides,
    };
}

/** Creates a widget for the given token and returns the created widget row. */
export async function createWidget(
    app: TestApp,
    token: string,
    overrides: Partial<WidgetPayload> = {},
): Promise<{ id: string; publicId: string; snippet: string }> {
    const res = await request(app.app.getHttpServer())
        .post('/api/v1/widgets')
        .set('Authorization', `Bearer ${token}`)
        .send(widgetPayload(overrides))
        .expect(201);
    return {
        id: res.body.widget.id,
        publicId: res.body.widget.publicId,
        snippet: res.body.snippet,
    };
}
