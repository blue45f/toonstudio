\pset pager off
\echo '== database ACL (grantee, privilege) -- migrator shown as (migrator)'
SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' WHEN pg_get_userbyid(a.grantee) = current_user THEN '(migrator)' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privileges
FROM pg_database d, aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a
WHERE d.datname = current_database() GROUP BY 1 ORDER BY 1;
\echo '== other login roles: CONNECT on this db / per-db settings / member-of relationships with the migrator'
SELECT r.rolname,
       r.rolcanlogin,
       has_database_privilege(r.rolname, current_database(), 'CONNECT') AS can_connect_here,
       has_schema_privilege(r.rolname, 'public', 'CREATE') AS can_create_in_public,
       pg_has_role(current_user, r.rolname, 'MEMBER') AS migrator_is_member,
       pg_has_role(current_user, r.rolname, 'USAGE') AS migrator_can_inherit,
       EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.roleid = r.oid AND m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)) AS granted_to_migrator,
       r.rolconnlimit,
       (SELECT count(*) FROM pg_db_role_setting s WHERE s.setrole = r.oid) AS role_settings
FROM pg_roles r WHERE r.rolname !~ '^pg_' AND r.rolname <> current_user ORDER BY 1;
\echo '== do these roles own anything in THIS database? (objects owned by non-migrator roles in public)'
SELECT pg_get_userbyid(c.relowner) AS owner, count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND pg_get_userbyid(c.relowner) <> current_user GROUP BY 1 ORDER BY 1;
