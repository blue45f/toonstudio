/**
 * 빈 DB를 확인하고 런타임 로그인을 막은 부트스트랩에서만 호출한다.
 * 현재 Drizzle 스키마에 포함된 전방 migration 소유 테이블은 원본 SQL이
 * 제약·트리거까지 다시 만들도록 역사적 기준선 채택 전에 제거한다.
 */
const FORWARD_MIGRATION_TABLES = Object.freeze([
  "admin_announcements",
  "admin_audit_logs",
  "admin_banned_words",
  "admin_content_reports",
  "admin_promos",
  "admin_security_policies",
  "creator_work_publication_media",
  "creator_work_asset_storage_reference",
  "creator_asset_storage_object",
  "creator_marketplace_library_item",
  "creator_marketplace_package_moderation",
  "creator_marketplace_package_moderation_decision",
  "creator_marketplace_publish_gate",
  "creator_marketplace_resource_report_gate",
  "creator_marketplace_resource_report",
  "creator_marketplace_resource",
  "creator_draft_collaboration_room",
  "personal_cloud_connection",
  "creator_marketplace_draft",
  "creator_marketplace_draft_revision",
  "creator_asset_upload_session",
  "creator_asset_processing_run",
  "creator_asset_processing_step",
  "creator_asset_artifact_set",
  "creator_asset_artifact",
  "creator_asset_qa_report",
  "creator_asset_license_snapshot",
  "creator_asset_rights_evidence",
  "creator_marketplace_release_artifact_binding",
  "creator_marketplace_release_availability",
  "creator_marketplace_entitlement_grant",
  "creator_work_catalog_asset_binding",
]);

export function buildForwardMigrationBoundarySql() {
  return `
DROP TABLE IF EXISTS
${FORWARD_MIGRATION_TABLES.map((table) => `  public.${table}`).join(",\n")}
CASCADE;
DROP EXTENSION IF EXISTS pg_trgm;
`;
}
