import { isWorkVrmCutActorScene } from "@toonstudio/contracts/studio-work-vrm-cut-scene-shape";
import { assertStudioScene3dDocument } from "@toonstudio/contracts/studio-scene3d-document";
import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { hashStudioScene3dCutValue } from "@toonstudio/contracts/studio-scene3d-cut-canonical";
import { workVrmCutBundledDigest } from "@toonstudio/contracts/studio-work-vrm-cut-bundled";
import { WORK_VRM_CUT_MAX_ATTACHMENTS, type WorkVrmCutAttachment, type WorkVrmCutMetadata } from "@toonstudio/contracts/studio-work-vrm-cut";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function invalid(detail: string): never { throw new BadRequestException(detail); }

interface RequiredAttachment extends WorkVrmCutAttachment {
  width?: number;
  height?: number;
  painted?: boolean;
}

function checkSceneBounds(root: unknown): void {
  // JSON.parse 직후에 깊이와 원소 수를 검사해 재귀 해시와 후속 역직렬화 비용을 제한한다.
  const pending = [{ value: root, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++count > 200_000 || depth > 48) invalid("컷 장면 구조가 저장 한도를 초과합니다.");
    if (typeof value === "number" && !Number.isFinite(value)) invalid("장면에 유효하지 않은 수치가 있습니다.");
    if (typeof value === "string" && /^(?:blob:|data:|file:)/iu.test(value)) invalid("기기에만 있는 파일 주소를 팀 컷에 저장할 수 없습니다.");
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) invalid("지원하지 않는 장면 속성입니다.");
        pending.push({ value: child, depth: depth + 1 });
      }
    }
  }
}

function requirePrimitiveBackground(value: unknown): asserts value is Record<string, unknown> {
  if (!record(value) || value.kind !== "toonstudio.bg3d-scene" || (value.version !== 3 && value.version !== 4) ||
    !Array.isArray(value.nodes) || value.nodes.length > 512 || !value.nodes.every(node => record(node) && node.kind === "primitive") ||
    !Array.isArray(value.attachments) || value.attachments.length || !record(value.camera) || !record(value.output)) {
    invalid("팀 VRM 컷에는 기본 도형 배경을 사용할 수 있습니다. 가져온 배경 모델은 개인 원고에 보관해 주세요.");
  }
}

function upsertDependency(required: Map<string, RequiredAttachment>, ref: Record<string, unknown>, type: "vrm" | "image", painted: boolean): void {
  if (typeof ref.hash !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(ref.hash) ||
    typeof ref.byteSize !== "number" || !Number.isSafeInteger(ref.byteSize) || ref.byteSize < 1) invalid("컷 첨부의 해시 또는 바이트 수가 잘못됐습니다.");
  const sha256 = ref.hash.slice(7), byteSize = ref.byteSize;
  if (type === "image" && (ref.mime !== "image/png" || !Number.isSafeInteger(ref.width) || !Number.isSafeInteger(ref.height) ||
    Number(ref.width) < 1 || Number(ref.height) < 1)) invalid("채색 파일의 PNG 규격이 잘못됐습니다.");
  const width = type === "image" ? Number(ref.width) : undefined, height = type === "image" ? Number(ref.height) : undefined;
  const previous = required.get(sha256);
  if (previous && (previous.elementType !== type || previous.byteSize !== byteSize || previous.width !== width || previous.height !== height))
    invalid("같은 해시를 가진 첨부의 규격이 서로 다릅니다.");
  required.set(sha256, { sha256, byteSize, elementType: type, assetId: `vrmcut-asset-${type}-${sha256}`, width, height, painted: painted || previous?.painted });
  if (required.size > WORK_VRM_CUT_MAX_ATTACHMENTS) invalid("팀 컷 한 개의 첨부 파일 수를 초과했습니다.");
}

export function inspectWorkVrmCutScene(scene: unknown, workId: string, metadata: WorkVrmCutMetadata): RequiredAttachment[] {
  checkSceneBounds(scene);
  requirePrimitiveBackground(scene);
  const cut = scene.pinnedVersionedCut;
  if (!record(cut) || !record(cut.source) || typeof cut.id !== "string" || !Number.isSafeInteger(cut.revision) ||
    !record(cut.camera) || !Array.isArray(cut.corrections) || !record(cut.performances) || !record(cut.source.characters) ||
    !record(cut.source.scene) || cut.source.scene.kind !== "toonstudio.scene3d" || !Array.isArray(cut.source.scene.assets) ||
    cut.source.scene.assets.length || cut.sourceHash !== hashStudioScene3dCutValue(cut.source)) invalid("고정한 컷 원본이나 장면 해시가 올바르지 않습니다.");
  try {
    assertStudioScene3dDocument(cut.source.scene);
    assertStudioScene3dDocument({ ...cut.source.scene, cameras: [cut.camera], activeCameraId: cut.camera.id, shots: [] });
  } catch { invalid("고정한 장면 좌표계, 개체 또는 카메라를 다시 열 수 없습니다."); }
  if (typeof cut.name !== "string" || !cut.name.trim() || !["draft", "approved", "needs-review"].includes(String(cut.status)) ||
    Number(cut.revision) < 0 || cut.corrections.length > 512) invalid("컷 이름, 버전 또는 검수 상태가 잘못됐습니다.");
  if (cut.source.legacyBg3d !== undefined) {
    requirePrimitiveBackground(cut.source.legacyBg3d);
    if (cut.source.legacyBg3d.pinnedVersionedCut != null) invalid("중첩된 컷 원본을 저장할 수 없습니다.");
  }
  const scope = createHash("sha256").update(JSON.stringify(["studio-work-vrm-cut:v1", workId, metadata.pageId])).digest("hex");
  const linked = cut.source.linkedVrm;
  if (!record(linked) || linked.version !== 1 || linked.documentScope !== `sha256:${scope}` ||
    !Array.isArray(linked.characters) || !linked.characters.length || linked.characters.length > 12) invalid("현재 작품·페이지에 고정한 VRM 컷을 선택해 주세요.");
  const required = new Map<string, RequiredAttachment>(), bundled = new Set<string>(), ids = new Set<string>();
  for (const actor of linked.characters) {
    if (!record(actor) || typeof actor.elementId !== "string" || !/^[a-z0-9][a-z0-9._~-]{0,127}$/iu.test(actor.elementId) ||
      ids.has(actor.elementId) || !record(actor.vrmScene) || !isWorkVrmCutActorScene(actor.vrmScene) || !record(actor.stageTransform) ||
      !Array.isArray(actor.stageTransform.position) || actor.stageTransform.position.length !== 3 ||
      !actor.stageTransform.position.every(Number.isFinite) || !Number.isFinite(actor.stageTransform.rotationY)) invalid("고정한 캐릭터나 무대 배치가 올바르지 않습니다.");
    ids.add(actor.elementId);
    const { model, surfacePaint } = actor.vrmScene;
    if (!record(model) || !record(surfacePaint) || !Array.isArray(surfacePaint.textures)) invalid("캐릭터 원본 또는 채색 정보가 없습니다.");
    if (model.source === "bundled" && typeof model.id === "string" && workVrmCutBundledDigest(model.id)) bundled.add(model.id);
    else if (model.source === "attachment") upsertDependency(required, model, "vrm", surfacePaint.textures.length > 0);
    else invalid("작품에서 다시 열 수 있는 VRM 모델을 선택해 주세요.");
    for (const texture of surfacePaint.textures) {
      if (!record(texture)) invalid("채색 파일 정보가 올바르지 않습니다.");
      upsertDependency(required, texture, "image", false);
    }
  }
  if (metadata.bundledModels.length !== bundled.size || !metadata.bundledModels.every(model =>
    bundled.delete(model.id) && model.sha256 === workVrmCutBundledDigest(model.id))) invalid("캐릭터 파일 버전이 달라졌습니다. 컷을 다시 열어 확인해 주세요.");
  return [...required.values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
}
