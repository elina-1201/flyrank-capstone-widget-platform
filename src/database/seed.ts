import 'dotenv/config';
import { scrypt as _scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Owner } from '../owner/owner.entity';
import { Widget } from '../widgets/widget.entity';
import dataSource from './data-source';

const scrypt = promisify(_scrypt);

// Same format as AuthService.hashPassword so the seeded owner can log in.
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'password123';
// Fixed ids give the demo widget stable, nameable inputs: the bundled
// customer-site page and the evaluator probes (capstone.yaml) point at them.
const DEMO_WIDGET_ID = '00000000-0000-4000-8000-000000000001';
const DEMO_WIDGET_PUBLIC_ID = 'demoWidget01';

/**
 * Seeds demo data: one owner and one signup-form widget. Idempotent — re-running
 * reuses the existing owner and widget instead of duplicating them.
 *
 * Run with `pnpm seed` (after the schema exists; migrations apply on boot).
 */
async function seed(ds: DataSource): Promise<void> {
  const owners = ds.getRepository(Owner);
  const widgets = ds.getRepository(Widget);

  let owner = await owners.findOne({ where: { email: DEMO_EMAIL } });
  if (!owner) {
    owner = await owners.save(
      owners.create({
        name: 'Demo Owner',
        email: DEMO_EMAIL,
        passwordHash: await hashPassword(DEMO_PASSWORD),
      }),
    );
    console.log(`Created owner ${DEMO_EMAIL} (password: ${DEMO_PASSWORD})`);
  } else {
    console.log(`Owner ${DEMO_EMAIL} already exists — reusing it`);
  }

  let widget = await widgets.findOne({
    where: { ownerId: owner.id, title: 'Join our newsletter' },
  });
  if (!widget) {
    widget = await widgets.save(
      widgets.create({
        id: DEMO_WIDGET_ID,
        ownerId: owner.id,
        publicId: DEMO_WIDGET_PUBLIC_ID,
        type: 'signup_form',
        title: 'Join our newsletter',
        description: 'Demo widget created by the seed script.',
        fields: [
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'name', label: 'Name', type: 'text', required: false },
        ],
        buttonText: 'Subscribe',
        displayOptions: {},
      }),
    );
    console.log('Created demo widget');
  } else {
    console.log('Demo widget already exists — reusing it');
    if (widget.publicId !== DEMO_WIDGET_PUBLIC_ID) {
      console.log(
        `  (keeping its publicId "${widget.publicId}" — a fresh database creates "${DEMO_WIDGET_PUBLIC_ID}")`,
      );
    }
  }

  const base = (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );
  const version = process.env.WIDGET_BUNDLE_VERSION ?? 'v1';
  console.log('\nEmbed snippet:');
  console.log(
    `<script src="${base}/widget.${version}.js?id=${widget.publicId}"></script>`,
  );
}

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    await seed(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
