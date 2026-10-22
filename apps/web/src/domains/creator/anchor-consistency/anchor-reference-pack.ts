/**
 * 앵커 세트와 샷의 포즈·구도 캡처를 AI 컴포저의 이미지 참조 팩(`StudioAiImageReferenceDocument` v1)에 더하는 어댑터.
 *
 * 상태: current(순수 계산 + 시험). 이 어댑터가 만든 문서와 소재 초안을 컴포저에 실제로 넣는 화면 연결은 편집기 호스트
 * 수정이 필요해 아직 없다(docs/features/anchor-consistency.md). 연구실 화면은 같은 결과를 파일(ZIP)로 내보낸다.
 *
 * 규칙
 * - 역방향 호환: 입력 문서는 기존 `hydrateStudioAiImageReferenceDocument` 로 먼저 정본화한다(옛 배열 형식 포함). 이 어댑터가
 *   만들지 않은 참조(예: 3D 현재 샷 구도 `bg3d-current-shot-method`, 화풍 참조)는 그대로 둔다.
 * - 역할: 앵커는 `character`(정체성), 샷 포즈·구도는 `method`(카메라·포즈·구도)로만 넣는다. 화풍(`style`)은 건드리지 않는다.
 * - 상한: 역할당 6개, 제공자 안전 한도 16개, 이미지 한 장 12MiB, 전체 50MiB(`studio-ai-reference-images` 가 정한 값)를
 *   넘기지 않는다. 넘치면 조용히 자르지 않고 `skipped` 에 이유와 함께 돌려준다.
 * - 쌍 규칙: 좌우 짝(3/4 쌍, 옆 쌍)은 둘 다 들어갈 자리가 있을 때만 넣는다. 한쪽만 넣으면 참조가 한쪽으로 치우친다.
 * - 멱등: 같은 앵커 id 로 다시 더하면 이전에 더한 참조를 먼저 걷어 내고 다시 넣는다.
 * - 이진 데이터는 문서에 넣지 않는다(문서에는 소재 id 와 SHA-256 만). 소재 초안(`assets`)은 호스트가 소재 라이브러리에 저장할 때
 *   쓰는 메타데이터다.
 */

import {
  STUDIO_AI_IMAGE_REFERENCE_LIMITS,
  hydrateStudioAiImageReferenceDocument,
  type StudioAiImageReference,
  type StudioAiImageReferenceDocument,
  type StudioAiImageReferenceRole,
} from "../ai/studio-ai-image-reference-roles";
import { STUDIO_AI_ROLE_REFERENCE_REQUEST_LIMITS } from "../ai/studio-ai-reference-images";

import {
  ANCHOR_ANGLE_IDS,
  ANCHOR_LIMITS,
  isAnchorImageMimeType,
  type AnchorAngleId,
  type AnchorImageMimeType,
} from "./anchor-capture-spec";
import { anchorAssetRightsMetadata, type AnchorRights } from "./anchor-rights";

import type { AnchorCaptureSet } from "./anchor-capture-set";
import type { StudioAssetRightsMetadata } from "../studio-asset-library";

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const SHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

export const ANCHOR_REFERENCE_SET_PREFIX = "anchor-set-" as const;
export const ANCHOR_REFERENCE_SHOT_PREFIX = "anchor-shot-" as const;

/** 참조 팩이 받을 수 있는 크기 상한(화면 안내용). 값은 기존 참조 팩 모듈의 상수에서 온다. */
export const ANCHOR_REFERENCE_PACK_LIMITS = Object.freeze({
  maxPerRole: STUDIO_AI_IMAGE_REFERENCE_LIMITS.maxReferencesPerRole,
  /** 제공자 요청에 한 번에 보낼 수 있는 이미지 수와 문서 상한 중 작은 값. */
  maxTotal: Math.min(STUDIO_AI_ROLE_REFERENCE_REQUEST_LIMITS.maxImages, STUDIO_AI_IMAGE_REFERENCE_LIMITS.maxReferences),
  maxDecodedBytesPerImage: STUDIO_AI_ROLE_REFERENCE_REQUEST_LIMITS.maxDecodedBytesPerImage,
  maxTotalDecodedBytes: STUDIO_AI_ROLE_REFERENCE_REQUEST_LIMITS.maxTotalDecodedBytes,
});

/** 넣는 순서 — 정면, 3/4 쌍, 후면, 옆 쌍. 자리가 모자라면 뒤쪽 묶음부터 빠진다. */
export const ANCHOR_REFERENCE_GROUPS: readonly (readonly AnchorAngleId[])[] = Object.freeze([
  Object.freeze(["front"] as const),
  Object.freeze(["left-34", "right-34"] as const),
  Object.freeze(["back"] as const),
  Object.freeze(["left", "right"] as const),
]);

export const ANCHOR_REFERENCE_RIGHTS_NOTE_KO =
  "권리 확인: 사용자가 권리를 가졌거나 이용 허락을 받은 가상 캐릭터 이미지예요(실존 인물 아님).";

const DEFAULT_ANGLE_LABEL_KO: Readonly<Record<AnchorAngleId, string>> = Object.freeze({
  front: "정면",
  "left-34": "좌 3/4",
  left: "좌측",
  back: "후면",
  right: "우측",
  "right-34": "우 3/4",
});

export function anchorReferenceId(anchorId: string, angleId: AnchorAngleId): string {
  return `${ANCHOR_REFERENCE_SET_PREFIX}${anchorId}-${angleId}`;
}

export function anchorShotReferenceId(shotId: string): string {
  return `${ANCHOR_REFERENCE_SHOT_PREFIX}${shotId}`;
}

/** 이 앵커 id 의 세트가 더한 참조 id 여섯 개. 다른 앵커 id 와 접두어가 겹쳐도 섞이지 않게 정확히 이 목록으로만 판정한다. */
export function anchorSetReferenceIds(anchorId: string): readonly string[] {
  return ANCHOR_ANGLE_IDS.map((angleId) => anchorReferenceId(anchorId, angleId));
}

export type AnchorShotCaptureKind = "pose" | "composition";

export interface AnchorShotCaptureInput {
  readonly shotId: string;
  readonly kind: AnchorShotCaptureKind;
  readonly mimeType: AnchorImageMimeType;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly imageSha256: string;
  /** 편집기 참조 팩에 보이는 이름(선택). 비우면 기본 이름을 쓴다. */
  readonly label?: string;
}

export interface AnchorReferencePackInput {
  /** 현재 참조 문서. 옛 배열 형식·알 수 없는 값도 받는다(정본화한다). */
  readonly document: unknown;
  readonly anchorSet?: AnchorCaptureSet | null;
  readonly shotCaptures?: readonly AnchorShotCaptureInput[];
  readonly rights: AnchorRights;
  /** 이미지가 스테이지 캡처인지 파일인지. 소재 권리 메타데이터의 출처 종류가 된다. */
  readonly origin: "stage" | "file";
  /** 이미 참조 팩에 들어 있는 이미지의 디코딩 크기 합(알 때만). 모르면 0 으로 보고 경고한다. */
  readonly existingBytes?: number;
  /** 각도 이름 덮어쓰기(번역된 이름). 기본은 한국어 이름이다. */
  readonly angleLabels?: Partial<Readonly<Record<AnchorAngleId, string>>>;
}

export type AnchorReferenceSkipReason =
  | "role-limit"
  | "provider-limit"
  | "pair-rule"
  | "byte-budget"
  | "invalid-shot"
  | "duplicate-content";

export interface AnchorReferenceSkipped {
  readonly referenceId: string;
  readonly reason: AnchorReferenceSkipReason;
  readonly angleId?: AnchorAngleId;
  readonly shotId?: string;
}

export interface AnchorReferenceAdded {
  readonly referenceId: string;
  readonly role: StudioAiImageReferenceRole;
  readonly assetId: string;
  readonly angleId?: AnchorAngleId;
  readonly shotId?: string;
}

export type AnchorReferenceWarningCode = "missing-front" | "missing-mirror-pair" | "existing-bytes-unknown" | "replaced-previous";

export interface AnchorReferenceWarning {
  readonly code: AnchorReferenceWarningCode;
  readonly angleId?: AnchorAngleId;
  readonly relatedAngleId?: AnchorAngleId;
  readonly count?: number;
}

/** 호스트가 소재 라이브러리에 저장할 때 쓰는 메타데이터 초안(이진 데이터 제외). */
export interface AnchorReferenceAssetDraft {
  readonly assetId: string;
  readonly name: string;
  readonly contentHash: `sha256:${string}`;
  readonly mimeType: AnchorImageMimeType;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly kind: "anchor-capture" | "anchor-shot";
  readonly rights: StudioAssetRightsMetadata;
}

export interface AnchorReferenceUsage {
  readonly character: number;
  readonly method: number;
  readonly style: number;
  readonly total: number;
  readonly addedBytes: number;
}

export interface AnchorReferencePackResult {
  readonly document: StudioAiImageReferenceDocument;
  readonly added: readonly AnchorReferenceAdded[];
  /** 같은 앵커 id·샷 id 로 이전에 더했다가 이번에 걷어 낸 참조 id. */
  readonly removedReferenceIds: readonly string[];
  readonly skipped: readonly AnchorReferenceSkipped[];
  readonly warnings: readonly AnchorReferenceWarning[];
  readonly assets: readonly AnchorReferenceAssetDraft[];
  readonly usage: AnchorReferenceUsage;
}

function countRole(document: StudioAiImageReferenceDocument, role: StudioAiImageReferenceRole): number {
  return document.references.filter((reference) => reference.role === role).length;
}

function usageOf(document: StudioAiImageReferenceDocument, addedBytes: number): AnchorReferenceUsage {
  return Object.freeze({
    character: countRole(document, "character"),
    method: countRole(document, "method"),
    style: countRole(document, "style"),
    total: document.references.length,
    addedBytes,
  });
}

function anchorGuidance(angleLabel: string): string {
  return [
    `캐릭터 앵커 · ${angleLabel}. 같은 가상 캐릭터의 정/반측 턴테이블 컷이에요.`,
    "얼굴·체형·헤어·의상처럼 반복되어야 할 정체성만 참고하고 포즈·배경·조명·화풍은 따라 하지 마세요.",
    "결과가 같은 캐릭터로 그려진다는 보장은 없어요.",
    ANCHOR_REFERENCE_RIGHTS_NOTE_KO,
  ].join(" ");
}

function shotGuidance(kind: AnchorShotCaptureKind): string {
  const scope = kind === "pose"
    ? "포즈·실루엣·신체 비율과 피사체 방향"
    : "카메라 각도·프레이밍·원근·공간 배치";
  return [
    `샷 ${kind === "pose" ? "포즈" : "구도"} 참조예요. ${scope}만 참고하고 원본의 정체성·화풍·문자는 복제하지 마세요.`,
    "3D 광택·와이어프레임·좌표축·그리드는 제거하고, 정체성은 캐릭터 앵커를 우선하세요.",
    ANCHOR_REFERENCE_RIGHTS_NOTE_KO,
  ].join(" ");
}

function validShotCapture(shot: AnchorShotCaptureInput): boolean {
  return SHOT_ID_PATTERN.test(shot.shotId)
    && (shot.kind === "pose" || shot.kind === "composition")
    && isAnchorImageMimeType(shot.mimeType)
    && Number.isSafeInteger(shot.width) && shot.width > 0
    && Number.isSafeInteger(shot.height) && shot.height > 0
    && Number.isSafeInteger(shot.byteLength) && shot.byteLength > 0
    && SHA256_HEX_PATTERN.test(shot.imageSha256);
}

/**
 * 앵커 세트와 샷 캡처를 참조 팩에 더한 새 문서를 돌려준다. 입력 문서는 바꾸지 않는다.
 * 더하지 못한 것은 `skipped` 에 이유와 함께 남고, 호출자는 그 목록을 사용자에게 보여 줘야 한다.
 */
export function addAnchorReferencesToPack(input: AnchorReferencePackInput): AnchorReferencePackResult {
  const canonical = hydrateStudioAiImageReferenceDocument(input.document);
  const anchorSet = input.anchorSet ?? null;
  const shots = input.shotCaptures ?? [];
  const labelOf = (angleId: AnchorAngleId): string => input.angleLabels?.[angleId] ?? DEFAULT_ANGLE_LABEL_KO[angleId];

  const ownIds = new Set<string>(anchorSet ? anchorSetReferenceIds(anchorSet.anchorId) : []);
  for (const shot of shots) {
    if (validShotCapture(shot)) ownIds.add(anchorShotReferenceId(shot.shotId));
  }
  const removedReferenceIds = canonical.references.filter((reference) => ownIds.has(reference.id)).map((reference) => reference.id);
  const kept = canonical.references.filter((reference) => !ownIds.has(reference.id));

  const warnings: AnchorReferenceWarning[] = [];
  const skipped: AnchorReferenceSkipped[] = [];
  const added: AnchorReferenceAdded[] = [];
  const assets: AnchorReferenceAssetDraft[] = [];
  const created: StudioAiImageReference[] = [];
  const limits = ANCHOR_REFERENCE_PACK_LIMITS;
  const existingBytes = input.existingBytes ?? 0;
  if (input.existingBytes === undefined && kept.length > 0) warnings.push({ code: "existing-bytes-unknown" });
  if (removedReferenceIds.length > 0) warnings.push({ code: "replaced-previous", count: removedReferenceIds.length });

  let total = kept.length;
  let characterCount = kept.filter((reference) => reference.role === "character").length;
  let methodCount = kept.filter((reference) => reference.role === "method").length;
  let addedBytes = 0;
  const keptMethodHashes = new Set(
    kept.filter((reference) => reference.role === "method" && reference.asset.sha256).map((reference) => reference.asset.sha256),
  );

  const push = (reference: StudioAiImageReference, entry: AnchorReferenceAdded, asset: AnchorReferenceAssetDraft): void => {
    created.push(reference);
    added.push(entry);
    assets.push(asset);
    total += 1;
    addedBytes += asset.byteLength;
  };

  if (anchorSet) {
    const present = new Map(anchorSet.entries.map((entry) => [entry.angleId, entry] as const));
    if (!present.has("front")) warnings.push({ code: "missing-front" });
    for (const group of ANCHOR_REFERENCE_GROUPS) {
      const members = group.filter((angleId) => present.has(angleId));
      if (members.length === 0) continue;
      const partner = group.length === 2 ? group.find((angleId) => !present.has(angleId)) : undefined;
      const firstMember = members[0];
      if (partner && firstMember) warnings.push({ code: "missing-mirror-pair", angleId: firstMember, relatedAngleId: partner });
      const roleRoom = limits.maxPerRole - characterCount;
      const totalRoom = limits.maxTotal - total;
      const room = Math.min(roleRoom, totalRoom);
      const skipGroup = (reason: AnchorReferenceSkipReason): void => {
        for (const angleId of members) {
          skipped.push({ referenceId: anchorReferenceId(anchorSet.anchorId, angleId), reason, angleId });
        }
      };
      if (room < members.length) {
        skipGroup(room <= 0 ? (roleRoom <= 0 ? "role-limit" : "provider-limit") : "pair-rule");
        continue;
      }
      const groupBytes = members.reduce((sum, angleId) => sum + (present.get(angleId)?.byteLength ?? 0), 0);
      if (members.some((angleId) => (present.get(angleId)?.byteLength ?? 0) > limits.maxDecodedBytesPerImage)
        || existingBytes + addedBytes + groupBytes > limits.maxTotalDecodedBytes
        || addedBytes + groupBytes > ANCHOR_LIMITS.maxSetBytes) {
        skipGroup("byte-budget");
        continue;
      }
      for (const angleId of members) {
        const entry = present.get(angleId);
        if (!entry) continue;
        const referenceId = anchorReferenceId(anchorSet.anchorId, angleId);
        const assetId = `anchor:${anchorSet.anchorId}:${angleId}`;
        const sha256 = `sha256:${entry.imageSha256}` as const;
        push(
          { id: referenceId, role: "character", asset: { assetId, sha256 }, label: `앵커 ${labelOf(angleId)}`, guidance: anchorGuidance(labelOf(angleId)) },
          { referenceId, role: "character", assetId, angleId },
          {
            assetId,
            name: `앵커 ${anchorSet.anchorId} · ${labelOf(angleId)}`,
            contentHash: sha256,
            mimeType: entry.mimeType,
            width: entry.width,
            height: entry.height,
            byteLength: entry.byteLength,
            kind: "anchor-capture",
            rights: anchorAssetRightsMetadata(input.rights, input.origin),
          },
        );
        characterCount += 1;
      }
    }
  }

  for (const shot of shots) {
    const referenceId = SHOT_ID_PATTERN.test(shot.shotId) ? anchorShotReferenceId(shot.shotId) : `${ANCHOR_REFERENCE_SHOT_PREFIX}invalid`;
    if (!validShotCapture(shot)) {
      skipped.push({ referenceId, reason: "invalid-shot" });
      continue;
    }
    const sha256 = `sha256:${shot.imageSha256}` as const;
    if (keptMethodHashes.has(sha256) || created.some((reference) => reference.role === "method" && reference.asset.sha256 === sha256)) {
      skipped.push({ referenceId, reason: "duplicate-content", shotId: shot.shotId });
      continue;
    }
    if (limits.maxPerRole - methodCount < 1) {
      skipped.push({ referenceId, reason: "role-limit", shotId: shot.shotId });
      continue;
    }
    if (limits.maxTotal - total < 1) {
      skipped.push({ referenceId, reason: "provider-limit", shotId: shot.shotId });
      continue;
    }
    if (shot.byteLength > limits.maxDecodedBytesPerImage || existingBytes + addedBytes + shot.byteLength > limits.maxTotalDecodedBytes) {
      skipped.push({ referenceId, reason: "byte-budget", shotId: shot.shotId });
      continue;
    }
    const assetId = `anchor-shot:${shot.shotId}`;
    const defaultLabel = shot.kind === "pose" ? "샷 포즈 참조" : "샷 구도 참조";
    push(
      { id: referenceId, role: "method", asset: { assetId, sha256 }, label: shot.label?.trim() || defaultLabel, guidance: shotGuidance(shot.kind) },
      { referenceId, role: "method", assetId, shotId: shot.shotId },
      {
        assetId,
        name: shot.label?.trim() || `${defaultLabel} · ${shot.shotId}`,
        contentHash: sha256,
        mimeType: shot.mimeType,
        width: shot.width,
        height: shot.height,
        byteLength: shot.byteLength,
        kind: "anchor-shot",
        rights: anchorAssetRightsMetadata(input.rights, input.origin),
      },
    );
    methodCount += 1;
  }

  const document = hydrateStudioAiImageReferenceDocument({ version: canonical.version, references: [...kept, ...created] });
  // 정본화가 같은 소재의 같은 역할 중복을 합칠 수 있다. 문서에 남지 않은 항목은 더한 것으로 세지 않는다.
  const installed = new Set(document.references.map((reference) => reference.id));
  const lost = added.filter((entry) => !installed.has(entry.referenceId));
  const lostIds = new Set(lost.map((entry) => entry.referenceId));
  for (const entry of lost) {
    skipped.push({
      referenceId: entry.referenceId,
      reason: "duplicate-content",
      ...(entry.angleId ? { angleId: entry.angleId } : {}),
      ...(entry.shotId ? { shotId: entry.shotId } : {}),
    });
  }
  const keptAdded = added.filter((entry) => !lostIds.has(entry.referenceId));
  const keptAssetIds = new Set(keptAdded.map((entry) => entry.assetId));
  const keptAssets = assets.filter((asset) => keptAssetIds.has(asset.assetId));
  const finalBytes = keptAssets.reduce((sum, asset) => sum + asset.byteLength, 0);
  return Object.freeze({
    document,
    added: Object.freeze(keptAdded),
    removedReferenceIds: Object.freeze(removedReferenceIds),
    skipped: Object.freeze(skipped),
    warnings: Object.freeze(warnings),
    assets: Object.freeze(keptAssets),
    usage: usageOf(document, finalBytes),
  });
}

/** 이 앵커 id 의 세트가 더한 참조를 모두 걷어 낸 문서. 다른 참조는 그대로다. */
export function removeAnchorReferencesFromPack(document: unknown, anchorId: string): StudioAiImageReferenceDocument {
  const canonical = hydrateStudioAiImageReferenceDocument(document);
  const own = new Set(anchorSetReferenceIds(anchorId));
  return hydrateStudioAiImageReferenceDocument({
    version: canonical.version,
    references: canonical.references.filter((reference) => !own.has(reference.id)),
  });
}

/** 화면 표시용: 문서가 지금 얼마나 찼는지. */
export function describeReferencePackUsage(document: unknown): AnchorReferenceUsage {
  return usageOf(hydrateStudioAiImageReferenceDocument(document), 0);
}
