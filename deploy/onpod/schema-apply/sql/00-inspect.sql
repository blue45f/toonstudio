\pset pager off
\echo '== server'
select current_setting('server_version') as server_version, current_setting('max_connections') as max_connections, current_setting('server_encoding') as encoding, current_setting('max_identifier_length') as max_ident;
\echo '== migrator role attributes (name withheld)'
select rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolinherit, rolcanlogin from pg_roles where rolname = current_user;
\echo '== database ownership / privileges'
select (select pg_get_userbyid(datdba) = current_user from pg_database where datname = current_database()) as owns_database,
       has_database_privilege(current_user, current_database(), 'CREATE') as can_create_in_db,
       has_schema_privilege(current_user, 'public', 'CREATE') as can_create_in_public,
       has_schema_privilege(current_user, 'public', 'USAGE') as usage_public,
       (select pg_get_userbyid(nspowner) = current_user from pg_namespace where nspname = 'public') as owns_public_schema,
       (select count(*) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and backend_type = 'client backend') as other_client_conns;
\echo '== extensions (schema, owned-by-migrator)'
select e.extname, e.extversion, n.nspname as schema, (pg_get_userbyid(e.extowner) = current_user) as owned_by_migrator, e.extrelocatable
from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by 1;
\echo '== non-system schemas'
select nspname, (pg_get_userbyid(nspowner) = current_user) as owned_by_migrator from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema' order by 1;
\echo '== objects in public by relkind (all, incl. extension-owned)'
select c.relkind, count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' group by 1 order by 1;
\echo '== functions in public: total / extension-owned'
select count(*) as total, count(*) filter (where exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')) as extension_owned
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
\echo '== other roles (excluding migrator and pg_ built-ins)'
select rolname, rolsuper, rolcanlogin from pg_roles where rolname !~ '^pg_' and rolname <> current_user order by 1;
\echo '== available extensions of interest'
select name, default_version, installed_version from pg_available_extensions where name in ('pg_trgm','citext','pgcrypto','uuid-ossp','vector','postgis','btree_gin','btree_gist','pg_stat_statements','unaccent','hstore') order by 1;
\echo '== search_path / default privileges / session settings'
show search_path;
select count(*) as default_acl_rows from pg_default_acl;
\echo '== temp/tablespace and CREATE on database for PUBLIC'
select datacl is null as db_acl_default from pg_database where datname = current_database();
select nspacl::text like '%=UC/%' or nspacl::text like '%=U/%' as public_has_usage_on_public_schema from pg_namespace where nspname = 'public';
