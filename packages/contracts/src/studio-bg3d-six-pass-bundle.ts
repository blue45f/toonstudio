import { z } from "zod";

import { sha256HexPortable } from "./sha256-portable";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, STUDIO_BG3D_SIX_PASS_BUNDLE_MIN_PROJECT_VERSION,
  STUDIO_BG3D_SIX_PASS_ROLES, STUDIO_BG3D_SIX_PASS_IMAGE_BLEND_MODES } from "./studio-bg3d-six-pass-reference";

import type { StudioBg3dSixPassContentHash } from "./studio-bg3d-six-pass-reference";

export * from "./studio-bg3d-six-pass-reference";
export type { StudioBg3dSixPassArtifactRole } from "./studio-bg3d-six-pass-artifact-bytes";
export { verifyStudioBg3dSixPassArtifactBytes, verifyStudioBg3dSixPassBundleBodies, verifyStudioBg3dSixPassBundleSceneBytes, getStudioBg3dSixPassBundleArtifacts } from "./studio-bg3d-six-pass-artifact-bytes";

export const STUDIO_BG3D_SIX_PASS_BUNDLE_CONTRACT = "toonstudio.bg3d-sixpass-bundle.v1" as const;
export const STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT = "toonstudio.bg3d-sixpass-bundles.v1" as const;
export const STUDIO_BG3D_SIX_PASS_PNG_MAX_BYTES = 64 * 1024 * 1024;
export const STUDIO_BG3D_SIX_PASS_PNG_TOTAL_MAX_BYTES = 6 * STUDIO_BG3D_SIX_PASS_PNG_MAX_BYTES;
export const STUDIO_BG3D_SIX_PASS_SCENE_MAX_BYTES = 320 * 1024;
export const STUDIO_BG3D_SIX_PASS_MANIFEST_MAX_BYTES = 8 * 1024;
export const STUDIO_BG3D_SIX_PASS_STATE_MAX_BYTES = 16 * 1024 * 1024;
export const STUDIO_BG3D_SIX_PASS_MAX_PIXELS = 8_388_608;
const ENCODER = new TextEncoder();
const ID = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u);
const HASH = z.templateLiteral(["sha256:", z.string().regex(/^[a-f0-9]{64}$/u)]);
const AXIS = z.number().int().min(1).max(8192);
const READER = { minimumReaderCapability: z.literal(STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY),
  minimumProjectVersion: z.literal(STUDIO_BG3D_SIX_PASS_BUNDLE_MIN_PROJECT_VERSION) };

/** JSON 이외의 값을 조용히 버리지 않고 해시 생성 전에 거부한다. */
export function serializeStudioBg3dSixPassCanonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  const visit = (entry: unknown, depth: number): string => {
    if (depth > 64) throw new TypeError("6패스 JSON 중첩이 너무 깊습니다.");
    if (entry === null || typeof entry === "boolean" || typeof entry === "string") return JSON.stringify(entry);
    if (typeof entry === "number" && Number.isFinite(entry)) return JSON.stringify(entry);
    if (typeof entry !== "object" || entry === null) throw new TypeError("6패스 JSON에 직렬화할 수 없는 값이 있습니다.");
    if (ancestors.has(entry)) throw new TypeError("6패스 JSON 순환 참조는 저장할 수 없습니다.");
    const prototype = Object.getPrototypeOf(entry);
    if (!Array.isArray(entry) && prototype !== Object.prototype && prototype !== null) throw new TypeError("6패스 JSON에는 일반 객체만 저장할 수 있습니다.");
    ancestors.add(entry);
    try {
      if (Array.isArray(entry)) {
        const parts: string[] = [];
        for (let index = 0; index < entry.length; index += 1) {
          if (!Object.hasOwn(entry, index)) throw new TypeError("6패스 JSON 배열에 빈 슬롯이 있습니다.");
          parts.push(visit(entry[index], depth + 1));
        }
        return `[${parts.join(",")}]`;
      }
      const object = entry as Record<string, unknown>;
      return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${visit(object[key], depth + 1)}`).join(",")}}`;
    } finally { ancestors.delete(entry); }
  };
  return visit(value, 0);
}
export function hashStudioBg3dSixPassCanonicalJson(value: unknown): StudioBg3dSixPassContentHash {
  return `sha256:${sha256HexPortable(ENCODER.encode(serializeStudioBg3dSixPassCanonicalJson(value)))}`;
}
function boundedJson(value: unknown, maximum: number, context: z.RefinementCtx): void {
  if (ENCODER.encode(serializeStudioBg3dSixPassCanonicalJson(value)).byteLength > maximum)
    context.addIssue({ code: "custom", message: "6패스 JSON 바이트 예산을 초과했습니다." });
}
export const StudioBg3dSixPassPngArtifactSchema = z.object({
  contentHash: HASH, byteSize: z.number().int().min(1).max(STUDIO_BG3D_SIX_PASS_PNG_MAX_BYTES),
  mimeType: z.literal("image/png"), width: AXIS, height: AXIS,
}).strict().superRefine((value, context) => {
  if (value.width * value.height > STUDIO_BG3D_SIX_PASS_MAX_PIXELS)
    context.addIssue({ code: "custom", message: "6패스 PNG 픽셀 예산을 초과했습니다." });
});
export const StudioBg3dSixPassSceneArtifactSchema = z.object({
  documentVersion: z.literal(4), contentHash: HASH,
  byteSize: z.number().int().min(1).max(STUDIO_BG3D_SIX_PASS_SCENE_MAX_BYTES),
  mimeType: z.literal("application/json"), activeShotId: ID.nullable(),
}).strict();
export type StudioBg3dSixPassPngArtifact = z.infer<typeof StudioBg3dSixPassPngArtifactSchema>;
export type StudioBg3dSixPassSceneArtifact = z.infer<typeof StudioBg3dSixPassSceneArtifactSchema>;
export type StudioBg3dSixPassArtifact = StudioBg3dSixPassPngArtifact | StudioBg3dSixPassSceneArtifact;
export const StudioBg3dSixPassPresentationSchema = z.object({
  blendMode: z.enum(STUDIO_BG3D_SIX_PASS_IMAGE_BLEND_MODES),
  opacity: z.number().finite().min(0).max(1), visible: z.boolean(),
}).strict();
function layer<Role extends typeof STUDIO_BG3D_SIX_PASS_ROLES[number]>(role: Role) {
  return StudioBg3dSixPassPresentationSchema.extend({ role: z.literal(role), elementId: ID,
    artifact: StudioBg3dSixPassPngArtifactSchema }).strict();
}
export const StudioBg3dSixPassBundleManifestSchema = z.object({
  contract: z.literal(STUDIO_BG3D_SIX_PASS_BUNDLE_CONTRACT), version: z.literal(1), ...READER,
  bundleId: ID, renderRevisionId: ID, parentRevisionId: ID.nullable(), linePassRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1), pageId: ID, groupId: ID, anchorElementId: ID,
  width: AXIS, height: AXIS, cameraHash: HASH, outputSettingsHash: HASH, scene: StudioBg3dSixPassSceneArtifactSchema,
  layers: z.tuple([layer("color"), layer("tone"), layer("shadow"), layer("depth"), layer("texture-line"), layer("main-line")]),
}).strict().superRefine((value, context) => {
  if (value.width * value.height > STUDIO_BG3D_SIX_PASS_MAX_PIXELS
    || value.layers.some(({ artifact }) => artifact.width !== value.width || artifact.height !== value.height))
    context.addIssue({ code: "custom", message: "6패스 해상도가 일치하지 않거나 픽셀 예산을 초과했습니다." });
  if (new Set(value.layers.map(({ elementId }) => elementId)).size !== 6
    || !value.layers.some(({ elementId }) => elementId === value.anchorElementId))
    context.addIssue({ code: "custom", message: "6패스 요소 ID와 앵커 결박이 올바르지 않습니다." });
  if (value.parentRevisionId === value.renderRevisionId)
    context.addIssue({ code: "custom", message: "6패스 revision은 자신을 부모로 가질 수 없습니다." });
  if (value.layers.reduce((sum, { artifact }) => sum + artifact.byteSize, 0) > STUDIO_BG3D_SIX_PASS_PNG_TOTAL_MAX_BYTES)
    context.addIssue({ code: "custom", message: "6패스 PNG 합계 바이트 예산을 초과했습니다." });
  boundedJson(value, STUDIO_BG3D_SIX_PASS_MANIFEST_MAX_BYTES, context);
});
export type StudioBg3dSixPassBundleManifest = z.infer<typeof StudioBg3dSixPassBundleManifestSchema>;
export function parseStudioBg3dSixPassBundleManifest(value: unknown): StudioBg3dSixPassBundleManifest {
  return StudioBg3dSixPassBundleManifestSchema.parse(value);
}
export function serializeStudioBg3dSixPassBundleManifest(value: StudioBg3dSixPassBundleManifest): string {
  return serializeStudioBg3dSixPassCanonicalJson(parseStudioBg3dSixPassBundleManifest(value));
}
export function hashStudioBg3dSixPassBundleManifest(value: StudioBg3dSixPassBundleManifest): StudioBg3dSixPassContentHash {
  return `sha256:${sha256HexPortable(ENCODER.encode(serializeStudioBg3dSixPassBundleManifest(value)))}`;
}
export function assertStudioBg3dSixPassBundleTransition(previous: StudioBg3dSixPassBundleManifest | null,
  nextValue: StudioBg3dSixPassBundleManifest): void {
  const next = parseStudioBg3dSixPassBundleManifest(nextValue);
  if (!previous) {
    if (next.parentRevisionId !== null) throw new Error("처음 만드는 6패스 bundle에는 부모 revision이 없어야 합니다.");
    return;
  }
  const before = parseStudioBg3dSixPassBundleManifest(previous);
  if (next.parentRevisionId !== before.renderRevisionId || next.renderRevisionId === before.renderRevisionId
    || next.bundleId !== before.bundleId || next.pageId !== before.pageId || next.groupId !== before.groupId
    || next.anchorElementId !== before.anchorElementId
    || next.layers.some((entry, index) => entry.elementId !== before.layers[index].elementId))
    throw new Error("6패스 재캡처의 부모·bundle·요소 ID 결박이 일치하지 않습니다.");
  const beforeMain = before.layers.find(({ role }) => role === "main-line");
  const nextMain = next.layers.find(({ role }) => role === "main-line");
  const unchanged = before.scene.contentHash === next.scene.contentHash && beforeMain?.artifact.contentHash === nextMain?.artifact.contentHash;
  if (next.linePassRevision !== before.linePassRevision + (unchanged ? 0 : 1))
    throw new Error("6패스 main-line 원본의 revision 번호가 재캡처와 일치하지 않습니다.");
}
export const StudioBg3dSixPassBundleActiveReferenceSchema = z.object({
  kind: z.literal("bg3d-sixpass-bundle"), bundleId: ID, renderRevisionId: ID, manifestHash: HASH,
}).strict();
export const StudioBg3dSixPassBundleImageReferenceSchema = StudioBg3dSixPassBundleActiveReferenceSchema.extend({
  role: z.enum(STUDIO_BG3D_SIX_PASS_ROLES), elementId: ID,
}).strict();
export type StudioBg3dSixPassBundleActiveReference = z.infer<typeof StudioBg3dSixPassBundleActiveReferenceSchema>;
export function parseStudioBg3dSixPassBundleActiveReference(value: unknown): StudioBg3dSixPassBundleActiveReference {
  return StudioBg3dSixPassBundleActiveReferenceSchema.parse(value);
}
export const StudioBg3dSixPassBundleReceiptSchema = z.object({
  contract: z.literal("toonstudio.bg3d-sixpass-bundle-receipt.v1"), version: z.literal(1),
  scope: z.enum(["origin", "work"]), workId: ID.nullable(), state: z.literal("sealed"),
  bundleId: ID, renderRevisionId: ID, manifestHash: HASH,
}).strict().superRefine((value, context) => {
  if ((value.scope === "work") !== (value.workId !== null))
    context.addIssue({ code: "custom", message: "6패스 영수증의 작품 저장 범위가 일치하지 않습니다." });
});
export type StudioBg3dSixPassBundleReceipt = z.infer<typeof StudioBg3dSixPassBundleReceiptSchema>;
export function createStudioBg3dSixPassBundleReceipt(manifest: StudioBg3dSixPassBundleManifest,
  workId: string | null = null): StudioBg3dSixPassBundleReceipt {
  return StudioBg3dSixPassBundleReceiptSchema.parse({ contract: "toonstudio.bg3d-sixpass-bundle-receipt.v1", version: 1,
    scope: workId === null ? "origin" : "work", workId, state: "sealed", bundleId: manifest.bundleId,
    renderRevisionId: manifest.renderRevisionId, manifestHash: hashStudioBg3dSixPassBundleManifest(manifest) });
}
export function parseStudioBg3dSixPassBundleReceipt(value: unknown): StudioBg3dSixPassBundleReceipt {
  return StudioBg3dSixPassBundleReceiptSchema.parse(value);
}
export function verifyStudioBg3dSixPassBundleReceipt(receiptValue: unknown, manifest: StudioBg3dSixPassBundleManifest,
  workId: string | null = null): void {
  const receipt = parseStudioBg3dSixPassBundleReceipt(receiptValue);
  const expected = createStudioBg3dSixPassBundleReceipt(manifest, workId);
  if (serializeStudioBg3dSixPassCanonicalJson(receipt) !== serializeStudioBg3dSixPassCanonicalJson(expected))
    throw new Error("6패스 묶음 영수증이 요청한 본문·작품 범위와 일치하지 않습니다.");
}
export const StudioBg3dSixPassBundleStateSchema = z.object({
  contract: z.literal(STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT), version: z.literal(1), ...READER,
  bundles: z.array(z.object({ bundleId: ID, activeRevisionId: ID.nullable(),
    revisions: z.array(StudioBg3dSixPassBundleManifestSchema).min(1) }).strict()),
}).strict().superRefine((state, context) => {
  const bundleIds = new Set<string>();
  for (const bundle of state.bundles) {
    const revisions = new Map(bundle.revisions.map((revision) => [revision.renderRevisionId, revision]));
    if (bundleIds.has(bundle.bundleId) || revisions.size !== bundle.revisions.length
      || (bundle.activeRevisionId !== null && !revisions.has(bundle.activeRevisionId))) {
      context.addIssue({ code: "custom", message: "6패스 보존 revision·활성 포인터가 손상되었습니다." }); continue;
    }
    bundleIds.add(bundle.bundleId);
    if (bundle.revisions.filter(({ parentRevisionId }) => parentRevisionId === null).length !== 1)
      context.addIssue({ code: "custom", message: "6패스 bundle의 최초 revision이 유일하지 않습니다." });
    for (const revision of bundle.revisions) {
      if (revision.bundleId !== bundle.bundleId) context.addIssue({ code: "custom", message: "6패스 보존 bundle ID가 다릅니다." });
      const parent = revision.parentRevisionId === null ? null : revisions.get(revision.parentRevisionId);
      try {
        if (parent === undefined) throw new Error("보존된 부모 revision이 없습니다.");
        assertStudioBg3dSixPassBundleTransition(parent, revision);
        const seen = new Set([revision.renderRevisionId]);
        let ancestor = parent;
        while (ancestor) {
          if (seen.has(ancestor.renderRevisionId)) throw new Error("6패스 부모 revision이 순환합니다.");
          seen.add(ancestor.renderRevisionId);
          const nextAncestor = ancestor.parentRevisionId === null ? null : revisions.get(ancestor.parentRevisionId);
          if (nextAncestor === undefined) throw new Error("보존된 부모 revision이 없습니다.");
          ancestor = nextAncestor;
        }
      } catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "6패스 revision 결박이 손상되었습니다." }); }
    }
  }
  boundedJson(state, STUDIO_BG3D_SIX_PASS_STATE_MAX_BYTES, context);
});
export type StudioBg3dSixPassBundleState = z.infer<typeof StudioBg3dSixPassBundleStateSchema>;
export function parseStudioBg3dSixPassBundleState(value: unknown): StudioBg3dSixPassBundleState {
  return StudioBg3dSixPassBundleStateSchema.parse(value);
}
/** 비활성 revision도 retained feature이므로 구앱 입장 요구를 낮추지 않는다. */
export function studioBg3dSixPassBundleRequiredCapabilities(value: StudioBg3dSixPassBundleState): readonly string[] {
  parseStudioBg3dSixPassBundleState(value);
  return [STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY];
}
