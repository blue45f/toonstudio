/**
 * SKP 사이드카 — 가져온 .skp 가 남긴 "이름 기록"을 읽어 배치된 노드에 이름으로 잇는다.
 *
 * 무엇을 이어 주나
 * - 가져오기가 끝나면 변환 보고서의 컴포넌트·태그(레이어)·장면 이름이 자산 메타데이터(skpImport, 정규화 GLB 의 SHA-256 키)에
 *   남는다(studio-bg3d-skp-asset-metadata). 이 모듈은 그 기록을 읽는 쪽이다. 배치된 노드는 첨부 자료의 해시로 기록을 찾는다.
 * - 배치 때 노드에 `componentRef` 를 붙여 같은 .skp 를 여러 번 놓은 인스턴스를 컴포넌트 묶음으로 보이게 한다.
 *
 * 무엇을 이어 주지 않나 (화면과 문서에서도 같은 말로 알린다)
 * - SketchUp 의 컴포넌트 계층, 태그(레이어) 표시 상태, 장면(카메라) 은 복원하지 않는다. OpenSKP 보고서가 이름만 내보내기 때문이다.
 * - 장면 이름은 메모 후보일 뿐이다. 카메라 위치·표시 상태를 되살린다는 약속은 어디에도 하지 않는다.
 * - 이름은 .skp 파일 안의 믿을 수 없는 글자다. 화면에는 글자(text)로만 그리고, 문서에 옮길 때는 태그·메모 규칙을 다시 통과해야 한다.
 */

import {
  STUDIO_BG3D_COMPONENT_NAME_MAX_CODE_POINTS,
  normalizeStudioBg3dComponentRef,
  normalizeStudioBg3dDocumentText,
  normalizeStudioBg3dTags,
} from "./studio-bg3d-hierarchy";

import type { StudioBg3dComponentRef } from "./studio-bg3d-scene-document-types";

/** 컴포넌트 묶음 id 접두사. 뒤에는 정규화 GLB 해시의 앞 16자리가 온다. */
export const STUDIO_BG3D_SKP_COMPONENT_ID_PREFIX = "skp-";
const SKP_COMPONENT_ID_HEX_LENGTH = 16;
/** 이름이 규칙에 맞지 않을 때 쓰는 일반 이름(가져오기 메타데이터와 같은 값). */
export const STUDIO_BG3D_SKP_FALLBACK_COMPONENT_NAME = "SketchUp 모델";
/** 장면 이름 하나를 메모 후보 한 줄로 만들 때 앞에 붙이는 말. */
export const STUDIO_BG3D_SKP_MEMO_LINE_PREFIX = "SKP 장면: ";

const SHA256_CONTENT_HASH_PATTERN = /^sha256:([0-9a-f]{64})$/u;

/** 메타데이터 기록 중 이 모듈이 읽는 부분(StudioBg3dAssetMetadata 가 구조적으로 만족한다). */
export interface StudioBg3dSkpSidecarSource {
  readonly contentHash: string;
  readonly skpImport?: {
    readonly names: {
      readonly components: StudioBg3dSkpSidecarNames;
      readonly tags: StudioBg3dSkpSidecarNames;
      readonly scenes: StudioBg3dSkpSidecarNames;
    };
  };
}

export interface StudioBg3dSkpSidecarNames {
  /** 보고서가 이름을 읽었는지. false 면 "이름을 읽지 못한 파일"이라는 뜻이다. */
  readonly available: boolean;
  readonly items: readonly string[];
  /** 파일 안의 전체 개수. 저장 한도 때문에 items 보다 클 수 있다. */
  readonly total: number;
  readonly truncated: boolean;
}

export interface StudioBg3dSkpSidecar {
  readonly contentHash: string;
  readonly components: StudioBg3dSkpSidecarNames;
  readonly tags: StudioBg3dSkpSidecarNames;
  readonly scenes: StudioBg3dSkpSidecarNames;
}

export type StudioBg3dSkpSidecarLoad =
  | { readonly status: "found"; readonly sidecar: StudioBg3dSkpSidecar }
  /** 저장된 이름 기록이 없다 — 저장하지 못했거나 이 기기에서 가져온 자료가 아니다. */
  | { readonly status: "missing" }
  /** 기록 저장소를 읽지 못했다 — 다시 시도할 수 있다. */
  | { readonly status: "failed" };

/** 메타데이터 저장소 중 이 모듈이 읽는 동작 하나. 테스트는 가짜를 주입한다. */
export interface StudioBg3dSkpSidecarStore {
  readonly get: (contentHash: string, signal?: AbortSignal) => Promise<StudioBg3dSkpSidecarSource | null>;
}

export interface StudioBg3dSkpSidecarDeps {
  readonly loadStore?: () => Promise<StudioBg3dSkpSidecarStore>;
  readonly signal?: AbortSignal;
}

function sidecarNames(list: StudioBg3dSkpSidecarNames): StudioBg3dSkpSidecarNames {
  return Object.freeze({
    available: list.available,
    items: Object.freeze([...list.items]),
    total: list.total,
    truncated: list.truncated,
  });
}

/** 메타데이터 기록에서 이름 기록만 뽑는다. SKP 가져오기 기록이 아니면 null. */
export function toStudioBg3dSkpSidecar(metadata: StudioBg3dSkpSidecarSource | null): StudioBg3dSkpSidecar | null {
  const report = metadata?.skpImport;
  if (!metadata || !report) return null;
  return Object.freeze({
    contentHash: metadata.contentHash,
    components: sidecarNames(report.names.components),
    tags: sidecarNames(report.names.tags),
    scenes: sidecarNames(report.names.scenes),
  });
}

async function loadDefaultSidecarStore(): Promise<StudioBg3dSkpSidecarStore> {
  const store = await import("./studio-bg3d-asset-metadata-store");
  return { get: (contentHash, signal) => store.getStudioBg3dAssetMetadata(contentHash, { signal }) };
}

/** 정규화 GLB 해시로 이름 기록을 읽는다. 던지지 않고 상태값으로 알린다. */
export async function loadStudioBg3dSkpSidecar(
  contentHash: string,
  deps: StudioBg3dSkpSidecarDeps = {},
): Promise<StudioBg3dSkpSidecarLoad> {
  if (!SHA256_CONTENT_HASH_PATTERN.test(contentHash)) return { status: "missing" };
  try {
    const store = await (deps.loadStore ?? loadDefaultSidecarStore)();
    const sidecar = toStudioBg3dSkpSidecar(await store.get(contentHash, deps.signal));
    return sidecar ? { status: "found", sidecar } : { status: "missing" };
  } catch {
    return { status: "failed" };
  }
}

/** 같은 .skp(같은 해시)를 놓은 인스턴스가 한 묶음이 되도록 해시에서 컴포넌트 id 를 만든다. 해시가 올바르지 않으면 null. */
export function studioBg3dSkpComponentId(contentHash: string): string | null {
  const hex = SHA256_CONTENT_HASH_PATTERN.exec(contentHash)?.[1];
  return hex ? `${STUDIO_BG3D_SKP_COMPONENT_ID_PREFIX}${hex.slice(0, SKP_COMPONENT_ID_HEX_LENGTH)}` : null;
}

/**
 * 배치된 .skp 노드에 붙일 컴포넌트 참조. 이름은 자료 이름을 문서 규칙으로 정리한 값이고,
 * 규칙에 걸리면(주소·비밀 모양 등) 일반 이름으로 바꾼다. 해시가 올바르지 않으면 null 이라 아무것도 붙이지 않는다.
 */
export function createStudioBg3dSkpComponentRef(contentHash: string, displayName: string): StudioBg3dComponentRef | null {
  const id = studioBg3dSkpComponentId(contentHash);
  if (!id) return null;
  const name =
    normalizeStudioBg3dDocumentText(displayName, STUDIO_BG3D_COMPONENT_NAME_MAX_CODE_POINTS, true) ??
    STUDIO_BG3D_SKP_FALLBACK_COMPONENT_NAME;
  return normalizeStudioBg3dComponentRef({ id, name }) ?? null;
}

/**
 * 가져온 .skp 를 놓은 인스턴스에 컴포넌트 참조를 붙인 사본. 이미 사용자가 정한 참조가 있으면 그대로 둔다.
 * `source` 가 null 이면(.skp 가 아닌 자료) 인스턴스를 그대로 돌려준다.
 */
export function linkStudioBg3dSkpPlacement<T extends { readonly id: string; readonly componentRef?: StudioBg3dComponentRef }>(
  instance: T,
  source: { readonly contentHash: string; readonly name: string } | null,
): T {
  if (!source || instance.componentRef) return instance;
  const componentRef = createStudioBg3dSkpComponentRef(source.contentHash, source.name);
  return componentRef ? { ...instance, componentRef } : instance;
}

/** 장면의 모델 노드가 어느 .skp 에서 왔는지 — 첨부 자료의 해시와 이름. */
export interface StudioBg3dSkpSourceRef {
  readonly contentHash: string;
  readonly name: string;
}

/** 첨부 자료 중 이 모듈이 읽는 부분(StudioBg3dModelAttachment 가 구조적으로 만족한다). */
export interface StudioBg3dSkpAttachmentLike {
  readonly hash: string;
  readonly name: string;
  readonly generic3dWorkflow?: { readonly sourceFormat?: string };
}

/**
 * 모델 노드 중 .skp 에서 온 것을 노드 id 로 모은다. 판정은 첨부 자료의 원본 형식(sourceFormat === "skp") 하나이며,
 * 이름이나 파일 확장자는 보지 않는다. .skp 가 아닌 모델·첨부가 없는 노드는 빠진다.
 */
export function collectStudioBg3dSkpSources(input: {
  readonly customModels: readonly { readonly id: string; readonly modelId: string }[];
  readonly attachmentByStorageModelId: ReadonlyMap<string, StudioBg3dSkpAttachmentLike>;
}): ReadonlyMap<string, StudioBg3dSkpSourceRef> {
  const sources = new Map<string, StudioBg3dSkpSourceRef>();
  for (const model of input.customModels) {
    const attachment = input.attachmentByStorageModelId.get(model.modelId);
    if (attachment?.generic3dWorkflow?.sourceFormat !== "skp") continue;
    sources.set(model.id, Object.freeze({ contentHash: attachment.hash, name: attachment.name }));
  }
  return sources;
}

/**
 * 태그(레이어) 이름을 문서 태그 규칙으로 가른다: 통과한 이름은 중복 없이 제안하고, 규칙에 걸린 이름은 개수만 센다
 * (화면이 "n개는 제안하지 않아요"라고 숨기지 않고 알리기 위해서다).
 */
export function partitionStudioBg3dSkpTagNames(sidecar: StudioBg3dSkpSidecar): {
  readonly suggestions: readonly string[];
  readonly rejected: number;
} {
  const seen = new Set<string>();
  const suggestions: string[] = [];
  let rejected = 0;
  for (const raw of sidecar.tags.items) {
    const tag = normalizeStudioBg3dTags([raw], "node", "truncate")[0];
    if (!tag) {
      rejected += 1;
      continue;
    }
    if (seen.has(tag)) continue;
    seen.add(tag);
    suggestions.push(tag);
  }
  return { suggestions, rejected };
}

/** 태그(레이어) 이름 중 문서 태그 규칙을 통과하는 것만 추린 제안. 사용자가 하나씩 골라 붙인다. */
export function suggestStudioBg3dSkpTags(sidecar: StudioBg3dSkpSidecar): readonly string[] {
  return partitionStudioBg3dSkpTagNames(sidecar).suggestions;
}

/**
 * 장면 이름을 메모 후보 줄로 만든다. 카메라·표시 상태를 되살린다는 뜻이 아니라 "이 파일에 이런 장면이 있었다"는 기록일 뿐이다.
 * 후보가 메모 규칙을 통과하는지는 메모에 실제로 옮길 때(set-scene-meta 계획) 다시 판정한다.
 */
export function buildStudioBg3dSkpMemoCandidates(sidecar: StudioBg3dSkpSidecar): readonly string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of sidecar.scenes.items) {
    const name = normalizeStudioBg3dDocumentText(raw, STUDIO_BG3D_COMPONENT_NAME_MAX_CODE_POINTS * 2, true);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    lines.push(`${STUDIO_BG3D_SKP_MEMO_LINE_PREFIX}${name}`);
  }
  return lines;
}

/** 이름으로 소재를 찾기 위한 검색 글자. 컴포넌트·태그·장면 이름을 소문자로 모아 둔다(저장 한도 안의 이름만). */
export function studioBg3dSkpSidecarSearchText(sidecar: StudioBg3dSkpSidecar): string {
  return [...sidecar.components.items, ...sidecar.tags.items, ...sidecar.scenes.items]
    .join("\n")
    .normalize("NFKC")
    .toLowerCase();
}
