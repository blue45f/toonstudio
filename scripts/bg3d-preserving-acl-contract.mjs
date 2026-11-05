import { decideMigrationAction, validateAdoptionMarker, validateRuntimeDatabaseRole } from "./run-production-database-migrations.mjs";

export const BG3D_MIGRATION_ID = "0121_studio_bg3d_six_pass_bundle";
export const BG3D_MIGRATION_CHECKSUM = "22cf7750c6d272e9a4d6ff486b160c73c66c46540f81190a732075b77bf57d22";
export const BG3D_TABLES = Object.freeze(["studio_bg3d_bundle_revision", "studio_bg3d_bundle_artifact"]);
const MARKER_ID = "__managed_history_through_0019__";
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";

export function planBg3dPreservingAclMigration(manifest, ledger) {
  if (manifest.length !== 121 || manifest.at(-1)?.id !== BG3D_MIGRATION_ID
    || manifest.at(-1)?.checksum !== BG3D_MIGRATION_CHECKSUM) {
    throw new Error("기존 ACL 보존 경로는 검토한 0121 정본 manifest에만 사용할 수 있습니다.");
  }
  if (!validateAdoptionMarker(ledger, manifest)) throw new Error("기존 채택 marker가 없어 0121 적용을 거절합니다.");
  const knownIds = new Set([...manifest.map(({ id }) => id), MARKER_ID]);
  if ([...ledger.keys()].some((id) => !knownIds.has(id))) throw new Error("원장에 정본 밖 migration이 있어 적용을 거절합니다.");
  for (const row of ledger.values()) {
    if (!/^[a-f0-9]{40}$/u.test(row.releaseSha)) throw new Error("기존 원장의 release SHA가 올바르지 않습니다.");
  }
  const actions = manifest.map((migration) => ({
    migration,
    action: decideMigrationAction({ migration, ledgerEntry: ledger.get(migration.id), mode: "apply", adoptionMarkerPresent: true }),
  }));
  const pending = actions.filter(({ action }) => action !== "skip");
  if (pending.some(({ migration }) => migration.id !== BG3D_MIGRATION_ID)) {
    throw new Error("0121 이외의 pending migration이 있어 적용을 거절합니다.");
  }
  return { migration: manifest.at(-1), pending: pending.length === 1, skipped: manifest.length - pending.length };
}

export function buildSingleOwnerVerificationSql(runtimeRole) {
  const role = literal(validateRuntimeDatabaseRole(runtimeRole));
  return `SELECT current_user = ${role}
    AND session_user = current_user
    AND current_user = pg_get_userbyid(d.datdba)
    AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
    AND NOT EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid)
    AND has_schema_privilege(current_user, 'public', 'USAGE') AND has_schema_privilege(current_user, 'public', 'CREATE')
    FROM pg_database d JOIN pg_roles r ON r.rolname = current_user WHERE d.datname = current_database();`;
}

/** 기존 원장 권한은 읽기 검사만 한다. single-owner의 소유권을 분리 역할로 오인하지 않는다. */
export function buildExistingLedgerSafetySql() {
  return `SELECT NOT EXISTS (
    SELECT 1 FROM pg_namespace n, LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
    WHERE n.nspname = 'toonspectrum_ops' AND a.grantee = 0
    UNION ALL
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
      LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    WHERE n.nspname = 'toonspectrum_ops' AND c.relname IN ('deployment_migration','deployment_migration_lock') AND a.grantee = 0
  );`;
}

export function buildBg3dObjectStateSql() {
  return `SELECT jsonb_build_object(
    'tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('studio_bg3d_bundle_revision','studio_bg3d_bundle_artifact')),
    'guard', to_regprocedure('public.studio_bg3d_bundle_guard()') IS NOT NULL
  )::text;`;
}

/** 새 private 테이블/함수에 제삼자 권한이 전파될 default ACL은 재작성하지 않고 거절한다. */
export function buildBg3dDefaultAclSafetySql(runtimeRole) {
  const role = literal(validateRuntimeDatabaseRole(runtimeRole));
  return `SELECT NOT EXISTS (
    SELECT 1 FROM pg_default_acl d, LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname=current_user)
      AND (d.defaclnamespace = 0 OR d.defaclnamespace = 'public'::regnamespace)
      AND d.defaclobjtype IN ('r','f')
      AND a.grantee NOT IN (0, d.defaclrole, (SELECT oid FROM pg_roles WHERE rolname=${role}))
  );`;
}

/** 새 0121 객체를 제외한 모든 사용자 namespace의 기존 권한과 역할을 같은 방식으로 지문화한다. */
export function buildExistingAuthorizationFingerprintSql() {
  return `WITH namespaces AS (
    SELECT * FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
  ), relations AS (
    SELECT c.* FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p','S','v','m','f')
      AND NOT (n.nspname='public' AND c.relname IN ('studio_bg3d_bundle_revision','studio_bg3d_bundle_artifact'))
  ), facts AS (
    SELECT 'schema:' || n.oid AS key, jsonb_build_object('owner',n.nspowner,'acl',n.nspacl) AS value FROM namespaces n
    UNION ALL SELECT 'relation:' || c.oid, jsonb_build_object('owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity) FROM relations c
    UNION ALL SELECT 'column:' || a.attrelid || ':' || a.attnum, jsonb_build_object('name',a.attname,'acl',a.attacl) FROM pg_attribute a JOIN relations c ON c.oid=a.attrelid WHERE a.attnum>0 AND NOT a.attisdropped
    UNION ALL SELECT 'policy:' || p.oid, to_jsonb(p) FROM pg_policy p JOIN relations c ON c.oid=p.polrelid
    UNION ALL SELECT 'function:' || p.oid, jsonb_build_object('owner',p.proowner,'acl',p.proacl,'securityDefiner',p.prosecdef)
      FROM pg_proc p JOIN namespaces n ON n.oid=p.pronamespace WHERE NOT (n.nspname='public' AND p.proname='studio_bg3d_bundle_guard' AND p.pronargs=0)
    UNION ALL SELECT 'type:' || t.oid, jsonb_build_object('owner',t.typowner,'acl',t.typacl)
      FROM pg_type t JOIN namespaces n ON n.oid=t.typnamespace WHERE NOT (n.nspname='public' AND t.typname IN
        ('studio_bg3d_bundle_revision','studio_bg3d_bundle_artifact','_studio_bg3d_bundle_revision','_studio_bg3d_bundle_artifact'))
    UNION ALL SELECT 'role:' || r.oid, to_jsonb(r)-'rolpassword' FROM pg_roles r
    UNION ALL SELECT 'membership:' || m.roleid || ':' || m.member || ':' || m.grantor, to_jsonb(m) FROM pg_auth_members m
    UNION ALL SELECT 'default:' || d.oid, to_jsonb(d) FROM pg_default_acl d
    UNION ALL SELECT 'database:' || d.oid, jsonb_build_object('owner',d.datdba,'acl',d.datacl) FROM pg_database d WHERE d.datname=current_database()
  ) SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(jsonb_build_object('key',key,'value',value) ORDER BY key),'[]'::jsonb)::text,'UTF8')),'hex') FROM facts;`;
}

export function validateBg3dObjectState(state, pending) {
  if (pending ? state.tables !== 0 || state.guard : state.tables !== 2 || !state.guard) {
    throw new Error("0121 원장과 신규 객체 상태가 일치하지 않습니다. 자동 채택·복구하지 않습니다.");
  }
}
