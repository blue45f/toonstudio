import { validateRuntimeDatabaseRole } from "./database-runtime-role.mjs";

const columns = '"workId", "anchorId", "pageId", "sceneText", "sceneSha256", "compositeSha256", "bundledModels", attachments, rights';
function roleName(value) {
  if (validateRuntimeDatabaseRole(value) === "public") throw new Error("팀 컷 DB 역할 이름이 올바르지 않습니다.");
  return value;
}
/** 이미지와 컷은 한 트랜잭션에서 삽입한다. 이미 봉인된 원본을 덮어쓸 권한은 필요 없다. */
export function buildWorkVrmCutRuntimeAclSql(runtimeRole) {
  const role = roleName(runtimeRole);
  return `REVOKE ALL ON TABLE public.studio_work_vrm_cut FROM PUBLIC, "${role}";
    REVOKE ALL PRIVILEGES (${columns}) ON TABLE public.studio_work_vrm_cut FROM PUBLIC, "${role}";
    GRANT SELECT ON TABLE public.studio_work_vrm_cut TO "${role}";
    GRANT INSERT (${columns}) ON TABLE public.studio_work_vrm_cut TO "${role}";`;
}
export function buildWorkVrmCutRuntimeAclViolationSql(runtimeRole) {
  const role = roleName(runtimeRole);
  return `(NOT has_table_privilege('${role}', 'public.studio_work_vrm_cut', 'SELECT')
    OR has_table_privilege('${role}', 'public.studio_work_vrm_cut', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege(0::oid, 'public.studio_work_vrm_cut', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.studio_work_vrm_cut'::regclass AND attnum>0 AND NOT attisdropped
      AND (NOT has_column_privilege('${role}', attrelid, attname, 'INSERT')
        OR has_column_privilege('${role}', attrelid, attname, 'UPDATE,REFERENCES')
        OR has_column_privilege(0::oid, attrelid, attname, 'SELECT,INSERT,UPDATE,REFERENCES'))))`;
}
