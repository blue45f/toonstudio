-- Safe reset for the onpod toonstudio-db: removes ONLY application objects created by the schema bootstrap.
--   * never drops schema public (it hosts the platform-owned extensions: postgis, vector, pg_trgm, citext, pgcrypto, uuid-ossp)
--   * never drops an extension or an extension member object (pg_depend deptype 'e' is excluded)
--   * drops schema toonspectrum_ops (migration ledger + lock) with CASCADE
-- Use only on this disposable, empty-by-design database.
\set ON_ERROR_STOP on
BEGIN;
DO $reset$
DECLARE
  item record;
BEGIN
  DROP SCHEMA IF EXISTS toonspectrum_ops CASCADE;

  -- views / materialized views / foreign tables / tables / partitioned tables (CASCADE removes dependants)
  FOR item IN
    SELECT format('%I.%I', n.nspname, c.relname) AS name, c.relkind
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm', 'f', 'p', 'r')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_catalog.pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
      AND NOT c.relispartition
    ORDER BY CASE c.relkind WHEN 'v' THEN 1 WHEN 'm' THEN 2 WHEN 'f' THEN 3 ELSE 4 END, c.relname
  LOOP
    EXECUTE format('DROP %s IF EXISTS %s CASCADE',
      CASE item.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END, item.name);
  END LOOP;

  -- standalone sequences left behind
  FOR item IN
    SELECT format('%I.%I', n.nspname, c.relname) AS name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_catalog.pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS %s CASCADE', item.name);
  END LOOP;

  -- functions / procedures that are not extension members
  FOR item IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)) AS name, p.prokind
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP %s IF EXISTS %s CASCADE', CASE item.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END, item.name);
  END LOOP;

  -- standalone types (enum / composite / domain / range) that are not extension members and not table row types
  FOR item IN
    SELECT format('%I.%I', n.nspname, t.typname) AS name
    FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typrelid = 0 AND t.typelem = 0 AND t.typtype IN ('c', 'd', 'e', 'r', 'm')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_catalog.pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS %s CASCADE', item.name);
  END LOOP;
END
$reset$;
COMMIT;
\echo 'reset-app-objects: remaining non-extension objects in public / toonspectrum_ops:'
SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','toonspectrum_ops') AND c.relkind IN ('r','p','v','m','S','f')
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')) AS relations,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')) AS functions,
       to_regnamespace('toonspectrum_ops') IS NOT NULL AS ops_schema_exists;
