-- Runs once, on first initialization of the Postgres data volume (the official
-- image executes /docker-entrypoint-initdb.d/*.sql only when the data dir is empty).
-- Creates the dedicated database the e2e suites connect to (test/setup-e2e.ts),
-- so `docker compose up` is a complete setup on a clean machine.
--
-- On a volume that predates this file the script will not re-run — reset with
-- `docker compose down -v`, or create the database by hand:
--   docker compose exec db psql -U postgres -c 'CREATE DATABASE embedded_widget_test;'
CREATE DATABASE embedded_widget_test;
