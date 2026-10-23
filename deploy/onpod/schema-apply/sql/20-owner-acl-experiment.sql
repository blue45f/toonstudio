-- Rolled-back experiment: can the table OWNER be made to look like a limited runtime role to has_*_privilege()?
\pset pager off
BEGIN;
\echo '--- before (owner, as deployed)'
SELECT has_table_privilege(current_user,'public.creator_marketplace_publish_gate','DELETE') AS del,
       has_table_privilege(current_user,'public.creator_marketplace_publish_gate','TRUNCATE') AS trunc,
       has_table_privilege(current_user,'public.creator_marketplace_publish_gate','DELETE WITH GRANT OPTION') AS del_wgo,
       has_any_column_privilege(current_user,'public.creator_marketplace_publish_gate','SELECT WITH GRANT OPTION') AS col_sel_wgo,
       (SELECT pg_get_userbyid(relowner) = current_user FROM pg_class WHERE oid = 'public.creator_marketplace_publish_gate'::regclass) AS is_owner;
REVOKE ALL ON TABLE public.creator_marketplace_publish_gate FROM CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.creator_marketplace_publish_gate TO CURRENT_USER;
\echo '--- after REVOKE ALL FROM owner + GRANT S/I/U/D TO owner'
SELECT has_table_privilege(current_user,'public.creator_marketplace_publish_gate','DELETE') AS del,
       has_table_privilege(current_user,'public.creator_marketplace_publish_gate','TRUNCATE') AS trunc,
       has_table_privilege(current_user,'public.creator_marketplace_publish_gate','DELETE WITH GRANT OPTION') AS del_wgo,
       has_any_column_privilege(current_user,'public.creator_marketplace_publish_gate','SELECT WITH GRANT OPTION') AS col_sel_wgo,
       has_any_column_privilege(current_user,'public.creator_marketplace_publish_gate','REFERENCES') AS col_refs;
SELECT relacl::text IS NOT NULL AS has_explicit_acl, (SELECT count(*) FROM aclexplode(relacl)) AS acl_entries FROM pg_class WHERE oid = 'public.creator_marketplace_publish_gate'::regclass;
ROLLBACK;
