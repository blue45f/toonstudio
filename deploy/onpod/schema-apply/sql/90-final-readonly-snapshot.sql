-- FINAL READ-ONLY SNAPSHOT (SELECT only). Run once before the password rotation.
\pset pager off
\echo '== out-of-manifest objects (expected missing: created by app runtime / separate SQL file)'
SELECT name, to_regclass(name) IS NOT NULL AS exists_now FROM (VALUES
  ('public.studio_3d_generation_jobs'), ('public.studio_3d_generation_artifacts'),
  ('public.studio_3d_generation_provider_identities'), ('public.traffic_web_vital')) AS v(name);
\echo '== ledger / relations / extension / lock / sessions'
SELECT (SELECT count(*) FROM toonspectrum_ops.deployment_migration) AS ledger_rows,
       (SELECT count(*) FROM toonspectrum_ops.deployment_migration WHERE state = 'applied') AS ledger_applied,
       (SELECT count(*) FROM toonspectrum_ops.deployment_migration WHERE id ~ '^\d{4}_') AS ledger_migrations,
       (SELECT count(*) FROM toonspectrum_ops.deployment_migration_lock) AS lock_rows,
       (SELECT count(*) FROM public.toonspectrum_schema_migration) AS legacy_cutover_markers,
       (SELECT extversion FROM pg_extension WHERE extname = 'pg_trgm') AS pg_trgm_version,
       (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend') AS other_sessions,
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')) AS app_tables_public,
       (SELECT count(*) FROM pg_prepared_xacts) AS prepared_xacts,
       (SELECT count(*) FROM pg_locks WHERE NOT granted) AS waiting_locks;
\echo '== owner privileges unchanged after the rolled-back experiments (expected t,t)'
SELECT has_table_privilege(current_user,'public.creator_marketplace_resource','DELETE') AS owner_can_delete_marketplace_resource,
       has_table_privilege(current_user,'public.account_merge','DELETE') AS owner_can_delete_account_merge;
\echo '== readiness relation proof via the same catalog filter the API uses (relkind r,p in public)'
SELECT count(*) AS tables_in_public_r_p FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p');
