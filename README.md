# Embeddable Widget & Lead-Capture Platform

## Database schema & migrations

The schema is owned by versioned TypeORM migrations — `synchronize` is off. Pending
migrations apply automatically on boot (`migrationsRun: true`), so `pnpm start:dev`
is still the only command needed to get a working schema.

Manage them explicitly when needed:

```bash
pnpm migration:run      # apply pending migrations
pnpm migration:revert   # roll back the last one
pnpm migration:generate src/database/migrations/<Name>  # diff entities → new migration
```

The CLI uses `src/database/data-source.ts`, which loads `.env` itself (it runs outside
Nest). After changing an entity, generate a migration and commit it — do not hand-edit
the generated SQL.
