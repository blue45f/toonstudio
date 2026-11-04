/** 새 6패스 테이블의 최소 런타임 권한. 원본 수정·삭제 권한은 부여하지 않는다. */
function checkedRole(value) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(value)) throw new Error("Invalid runtime database role");
  return value;
}
export function buildBg3dBundleRuntimeAclSql(runtimeRole) {
  const role = checkedRole(runtimeRole);
  return `
REVOKE ALL ON TABLE public.studio_bg3d_bundle_revision, public.studio_bg3d_bundle_artifact FROM PUBLIC, "${role}";
DO $bg3d_acl$
DECLARE item record; columns text;
BEGIN
  FOR item IN SELECT unnest(ARRAY['studio_bg3d_bundle_revision','studio_bg3d_bundle_artifact']) AS name LOOP
    SELECT string_agg(format('%I',attname), ',') INTO columns FROM pg_attribute
      WHERE attrelid=format('public.%I',item.name)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, %I', columns,item.name,'${role}');
  END LOOP;
END $bg3d_acl$;
GRANT SELECT ON TABLE public.studio_bg3d_bundle_revision, public.studio_bg3d_bundle_artifact TO "${role}";
GRANT INSERT ("workId", "bundleId", "renderRevisionId", "parentRevisionId", "manifestHash", manifest, "reservedBytes", state, "createdBy", "createdAt", "sealedAt") ON TABLE public.studio_bg3d_bundle_revision TO "${role}";
GRANT INSERT ("workId", "bundleId", "renderRevisionId", role, "contentHash", "byteSize", "objectReference", "createdAt") ON TABLE public.studio_bg3d_bundle_artifact TO "${role}";
GRANT UPDATE (state, "sealedAt") ON TABLE public.studio_bg3d_bundle_revision TO "${role}";
REVOKE ALL ON FUNCTION public.studio_bg3d_bundle_guard() FROM PUBLIC;
`;
}
export function buildBg3dBundleRuntimeAclViolationSql(runtimeRole) {
  const role = checkedRole(runtimeRole);
  return `EXISTS (
    SELECT 1 FROM (VALUES ('studio_bg3d_bundle_revision'::text,ARRAY['state','sealedAt']::text[]),
      ('studio_bg3d_bundle_artifact'::text,ARRAY[]::text[])) AS contract(name,mutable)
    WHERE NOT has_table_privilege('${role}',format('public.%I',name),'SELECT')
      OR NOT has_any_column_privilege('${role}',format('public.%I',name),'INSERT')
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
        WHERE has_table_privilege('${role}',format('public.%I',name),privilege))
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
        WHERE has_table_privilege(0::oid,format('public.%I',name),privilege))
      OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=format('public.%I',name)::regclass AND attnum>0 AND NOT attisdropped
        AND (NOT has_column_privilege('${role}',format('public.%I',name),attname,'INSERT')
          OR has_column_privilege('${role}',format('public.%I',name),attname,'UPDATE') IS DISTINCT FROM (attname=ANY(mutable))
          OR has_column_privilege('${role}',format('public.%I',name),attname,'REFERENCES')
          OR has_column_privilege(0::oid,format('public.%I',name),attname,'SELECT,INSERT,UPDATE,REFERENCES')))
  )`;
}
