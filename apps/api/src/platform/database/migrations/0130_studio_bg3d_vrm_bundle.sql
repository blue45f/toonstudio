-- 팀 원본 컷을 참조하는 6패스 v2를 추가한다. 기존 v1 행과 원본은 그대로 보존한다.
-- 이전 앱으로 복귀할 때는 v2 쓰기를 닫고 기존 v2의 reader 제한을 유지한다.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.studio_bg3d_bundle_revision
  ADD CONSTRAINT studio_bg3d_bundle_manifest_versions_check CHECK ((jsonb_typeof(manifest) = 'object'
    AND ((manifest->>'contract' = 'toonstudio.bg3d-sixpass-bundle.v1'
    AND manifest->'version' = '1'::jsonb)
    OR (manifest->>'contract' = 'toonstudio.bg3d-sixpass-bundle.v2'
    AND manifest->'version' = '2'::jsonb
    AND manifest->>'minimumReaderCapability' = 'bg3d-sixpass-bundle.v2'
    AND jsonb_typeof(manifest->'workVrmCut') = 'object'
    AND manifest#>>'{workVrmCut,anchorId}' ~ '^vrmcut-[0-9a-f]{8}-[0-9a-f]{4}-[48][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND manifest#>>'{workVrmCut,sceneSha256}' ~ '^[a-f0-9]{64}$'
    AND manifest#>>'{workVrmCut,compositeSha256}' ~ '^[a-f0-9]{64}$'))
    AND manifest->'minimumProjectVersion' = '5'::jsonb
    AND manifest->>'bundleId' = "bundleId"
    AND manifest->>'renderRevisionId' = "renderRevisionId"
    AND manifest->>'parentRevisionId' is not distinct from "parentRevisionId"
    AND jsonb_typeof(manifest->'layers') = 'array'
    AND jsonb_array_length(manifest->'layers') = 6
    AND octet_length(manifest::text) <= 16384) is true) NOT VALID;
ALTER TABLE public.studio_bg3d_bundle_revision VALIDATE CONSTRAINT studio_bg3d_bundle_manifest_versions_check;
ALTER TABLE public.studio_bg3d_bundle_revision DROP CONSTRAINT studio_bg3d_bundle_manifest_check;
ALTER TABLE public.studio_bg3d_bundle_revision RENAME CONSTRAINT studio_bg3d_bundle_manifest_versions_check TO studio_bg3d_bundle_manifest_check;
COMMIT;
