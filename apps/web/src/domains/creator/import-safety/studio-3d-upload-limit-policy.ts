/**
 * Wasm64(Memory64) · 로컬 기기 메모리 · OPFS 가용성을 반영한 3D 모델 업로드·로컬 임포트 용량 정책.
 *
 * - 브라우저 로컬 작업(OPFS 저장·편집)과 서버 HTTP 전송(작품 클라우드 동기화 12 MiB / AI 인라인 10 MiB)을
 *   명확히 분리한다.
 * - GLB JSON 청크 상한(4 MiB/8 MiB), ZIP 압축 해제 폭탄 방어, 외부 URI 차단 등 보안 경계는 완화하지 않는다.
 * - 테스트·Worker·SSR 어디서든 동일하게 동작하도록 브라우저 전역 신호를 순수 인자로 주입할 수 있다.
 */

import {
  STUDIO_WASM_PAGE_BYTES,
  checkStudioWasm64Capability,
} from "../studio-wasm64-memory-governor";

const KIB = 1024;
const MIB = 1024 * KIB;
const GIB = 1024 * MIB;

/** 로컬 3D 단일 모델 수용 한도 티어 (GLB · VRM · 네이티브 DCC · Specialist). */
export const STUDIO_3D_LOCAL_CONSTRAINED_MAX_BYTES = 128 * MIB;
export const STUDIO_3D_LOCAL_STANDARD_MAX_BYTES = 256 * MIB;
export const STUDIO_3D_LOCAL_WASM64_BALANCED_MAX_BYTES = 512 * MIB;
export const STUDIO_3D_LOCAL_WASM64_MAX_BYTES = 1 * GIB;

/** 로컬 변환 원본(OBJ · FBX · glTF · DAE · STL · PLY · 3DS) 단일 파일 한도 티어. */
export const STUDIO_3D_LOCAL_CONVERSION_CONSTRAINED_MAX_BYTES = 64 * MIB;
export const STUDIO_3D_LOCAL_CONVERSION_STANDARD_MAX_BYTES = 128 * MIB;
export const STUDIO_3D_LOCAL_CONVERSION_WASM64_BALANCED_MAX_BYTES = 256 * MIB;
export const STUDIO_3D_LOCAL_CONVERSION_WASM64_MAX_BYTES = 512 * MIB;

/** 텍스트 기반 3D 원본(OBJ · glTF · DAE · PLY · MTL) 단일 파일 한도 티어. */
export const STUDIO_3D_LOCAL_TEXT_CONSTRAINED_MAX_BYTES = 64 * MIB;
export const STUDIO_3D_LOCAL_TEXT_STANDARD_MAX_BYTES = 128 * MIB;
export const STUDIO_3D_LOCAL_TEXT_WASM64_MAX_BYTES = 256 * MIB;

/** SketchUp(.skp, OpenSKP Worker) 원본 및 압축 해제 model.dat 한도 티어. */
export const STUDIO_3D_LOCAL_SKP_MOBILE_MAX_BYTES = 32 * MIB;
export const STUDIO_3D_LOCAL_SKP_STANDARD_MAX_BYTES = 128 * MIB;
export const STUDIO_3D_LOCAL_SKP_WASM64_BALANCED_MAX_BYTES = 192 * MIB;
export const STUDIO_3D_LOCAL_SKP_WASM64_MAX_BYTES = 256 * MIB;

/** 다중 파일 일괄 로컬 가져오기 총용량 한도 티어. */
export const STUDIO_3D_LOCAL_BATCH_CONSTRAINED_MAX_BYTES = 512 * MIB;
export const STUDIO_3D_LOCAL_BATCH_STANDARD_MAX_BYTES = 1 * GIB;
export const STUDIO_3D_LOCAL_BATCH_WASM64_BALANCED_MAX_BYTES = 1536 * MIB;
export const STUDIO_3D_LOCAL_BATCH_WASM64_MAX_BYTES = 2 * GIB;

/** 씬 누적 3D 모델 예산 한도 티어. */
export const STUDIO_3D_LOCAL_SCENE_CONSTRAINED_MAX_BYTES = 256 * MIB;
export const STUDIO_3D_LOCAL_SCENE_STANDARD_MAX_BYTES = 512 * MIB;
export const STUDIO_3D_LOCAL_SCENE_WASM64_BALANCED_MAX_BYTES = 1 * GIB;
export const STUDIO_3D_LOCAL_SCENE_WASM64_MAX_BYTES = 2 * GIB;

/** 서버 HTTP 동기화·전송 계약 상한 (API/contracts 계약과 일치, 임의 상향 금지). */
export const STUDIO_3D_CLOUD_WORK_ASSET_3D_MAX_BYTES = 12 * MIB;
export const STUDIO_3D_CLOUD_AI_INLINE_MAX_BYTES = 10 * MIB;

export type Studio3dDeviceProfile = "mobile" | "desktop";

export type Studio3dUploadLimitTier =
  | "constrained"
  | "standard"
  | "wasm64-balanced"
  | "wasm64-high-memory";

export interface Studio3dNavigatorLike {
  readonly deviceMemory?: unknown;
  readonly storage?: {
    readonly getDirectory?: unknown;
  } | null;
}

export interface Studio3dRuntimeCapabilitySignals {
  readonly profile?: Studio3dDeviceProfile;
  /** 테스트·호스트 주입용. 생략하면 Wasm64 프로브 결과를 사용한다. */
  readonly isWasm64Supported?: boolean;
  /** GiB 단위 기기 메모리. `null`이면 미보고, 생략하면 `navigator.deviceMemory`를 읽는다. */
  readonly deviceMemoryGb?: number | null;
  /** OPFS 지원 여부. 생략하면 `navigator.storage?.getDirectory` 존재 여부를 확인한다. */
  readonly opfsAvailable?: boolean;
  /** 테스트용 WebAssembly 주입 seam. `null`이면 WebAssembly 미지원 환경으로 간주한다. */
  readonly webAssembly?: typeof WebAssembly | null;
  /** 테스트용 navigator 주입 seam. */
  readonly navigatorLike?: Studio3dNavigatorLike | null;
}

export interface Studio3dUploadLimitPolicy {
  readonly tier: Studio3dUploadLimitTier;
  readonly tierLabelKo: string;
  readonly tierLabelEn: string;
  readonly profile: Studio3dDeviceProfile;
  readonly isWasm64Supported: boolean;
  readonly deviceMemoryGb: number | null;
  readonly opfsAvailable: boolean;
  readonly maxLocalModelBytes: number;
  readonly maxLocalVrmBytes: number;
  readonly maxLocalConversionSourceBytes: number;
  readonly maxLocalTextSourceBytes: number;
  readonly maxLocalSkpSourceBytes: number;
  readonly maxLocalBatchTotalBytes: number;
  readonly maxLocalSceneCumulativeBytes: number;
  readonly maxDecodedGeometryBytes: number;
  readonly maxDecodedTextureBytes: number;
  readonly cloudWorkAsset3dMaxBytes: number;
  readonly cloudAiInlineMaxBytes: number;
}

export type Studio3dUploadTargetClassificationStatus =
  | "local-and-cloud"
  | "local-opfs-only"
  | "exceeds-local-limit";

export interface Studio3dUploadTargetClassification {
  readonly status: Studio3dUploadTargetClassificationStatus;
  readonly localMaxBytes: number;
  readonly cloudMaxBytes: number;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface Studio3dLocalLimitBannerCopy {
  readonly headlineKo: string;
  readonly detailKo: string;
  readonly headlineEn: string;
  readonly detailEn: string;
}

type WasmMemoryProbeDescriptor =
  | { readonly initial: bigint; readonly maximum: bigint; readonly address: "i64" }
  | { readonly initial: bigint; readonly maximum: bigint; readonly index: "i64" };

type WasmMemoryCtorLike = new (descriptor: WasmMemoryProbeDescriptor) => {
  readonly buffer?: { readonly byteLength?: unknown };
};

const ONE_PAGE_BYTES = Number(STUDIO_WASM_PAGE_BYTES);

function probeWasm64MemoryJsApi(webAssembly: typeof WebAssembly | null | undefined): boolean {
  if (!webAssembly || typeof webAssembly.Memory !== "function") return false;
  const MemoryCtor = webAssembly.Memory as unknown as WasmMemoryCtorLike;
  // 표준 JS API는 `address: "i64"`, 초기 초안 구현은 `index: "i64"`를 수용한다.
  // 1페이지(64 KiB)만 확인하고 즉시 해제하므로 대용량 힙을 예약하지 않는다.
  const descriptors: readonly WasmMemoryProbeDescriptor[] = [
    { initial: BigInt(1), maximum: BigInt(2), address: "i64" },
    { initial: BigInt(1), maximum: BigInt(2), index: "i64" },
  ];
  for (const descriptor of descriptors) {
    try {
      const memory = new MemoryCtor(descriptor);
      if (memory?.buffer?.byteLength === ONE_PAGE_BYTES) {
        return true;
      }
    } catch {
      // 다음 디스크립터 형식을 확인한다.
    }
  }
  return false;
}

/**
 * 현재 호스트가 WebAssembly Memory64(i64 주소 공간)를 지원하는지 확인한다.
 * 기본 경로는 `studio-wasm64-memory-governor`의 실측 프로브를 재사용하고,
 * 경량 목·특수 CSP 호스트에서는 1페이지(64 KiB) `WebAssembly.Memory` 프로브로 보강한다.
 */
export function probeStudio3dWasm64Support(options?: {
  readonly webAssembly?: typeof WebAssembly | null;
}): boolean {
  if (options?.webAssembly === null) return false;
  const report = checkStudioWasm64Capability({
    ...(options?.webAssembly !== undefined ? { webAssembly: options.webAssembly } : {}),
  });
  if (report.isWasm64Supported) return true;
  if (options?.webAssembly !== undefined) {
    return probeWasm64MemoryJsApi(options.webAssembly);
  }
  if (report.memory64.failureReason === "module-instantiation-failed") {
    return probeWasm64MemoryJsApi(typeof WebAssembly === "object" ? WebAssembly : null);
  }
  return false;
}

export function readStudio3dDeviceMemoryGb(
  navigatorLike?: Studio3dNavigatorLike | null,
): number | null {
  const nav = navigatorLike === undefined
    ? (typeof navigator === "object" && navigator !== null
      ? (navigator as unknown as Studio3dNavigatorLike)
      : null)
    : navigatorLike;
  const value = nav?.deviceMemory;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function detectStudio3dOpfsAvailable(
  navigatorLike?: Studio3dNavigatorLike | null,
): boolean {
  const nav = navigatorLike === undefined
    ? (typeof navigator === "object" && navigator !== null
      ? (navigator as unknown as Studio3dNavigatorLike)
      : null)
    : navigatorLike;
  return typeof nav?.storage?.getDirectory === "function";
}

export function formatStudio3dByteLimit(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes >= GIB) {
    const gib = bytes / GIB;
    const text = Number.isInteger(gib) ? String(gib) : gib.toFixed(1).replace(/\.0$/u, "");
    return `${text} GiB`;
  }
  if (bytes >= MIB) {
    const mib = bytes / MIB;
    const text = Number.isInteger(mib) ? String(mib) : mib.toFixed(1).replace(/\.0$/u, "");
    return `${text} MiB`;
  }
  if (bytes >= KIB) {
    return `${Math.round(bytes / KIB)} KiB`;
  }
  return `${Math.round(bytes)} B`;
}

function selectTier(
  profile: Studio3dDeviceProfile,
  isWasm64Supported: boolean,
  deviceMemoryGb: number | null,
): Studio3dUploadLimitTier {
  if (profile === "mobile") return "constrained";
  if (deviceMemoryGb !== null && deviceMemoryGb <= 2) return "constrained";
  if (isWasm64Supported) {
    if (deviceMemoryGb !== null && deviceMemoryGb < 8) return "wasm64-balanced";
    return "wasm64-high-memory";
  }
  if (deviceMemoryGb !== null && deviceMemoryGb < 4) return "constrained";
  return "standard";
}

interface TierSpec {
  readonly tierLabelKo: string;
  readonly tierLabelEn: string;
  readonly maxLocalModelBytes: number;
  readonly maxLocalConversionSourceBytes: number;
  readonly maxLocalTextSourceBytes: number;
  readonly maxLocalSkpSourceBytes: number;
  readonly maxLocalBatchTotalBytes: number;
  readonly maxLocalSceneCumulativeBytes: number;
  readonly maxDecodedGeometryBytes: number;
  readonly maxDecodedTextureBytes: number;
}

const TIER_SPECS: Readonly<Record<Studio3dUploadLimitTier, TierSpec>> = Object.freeze({
  constrained: Object.freeze({
    tierLabelKo: "모바일·저메모리 안전 티어",
    tierLabelEn: "Mobile / low-memory safe tier",
    maxLocalModelBytes: STUDIO_3D_LOCAL_CONSTRAINED_MAX_BYTES,
    maxLocalConversionSourceBytes: STUDIO_3D_LOCAL_CONVERSION_CONSTRAINED_MAX_BYTES,
    maxLocalTextSourceBytes: STUDIO_3D_LOCAL_TEXT_CONSTRAINED_MAX_BYTES,
    maxLocalSkpSourceBytes: STUDIO_3D_LOCAL_SKP_MOBILE_MAX_BYTES,
    maxLocalBatchTotalBytes: STUDIO_3D_LOCAL_BATCH_CONSTRAINED_MAX_BYTES,
    maxLocalSceneCumulativeBytes: STUDIO_3D_LOCAL_SCENE_CONSTRAINED_MAX_BYTES,
    maxDecodedGeometryBytes: 256 * MIB,
    maxDecodedTextureBytes: 128 * MIB,
  }),
  standard: Object.freeze({
    tierLabelKo: "표준 로컬 메모리 티어",
    tierLabelEn: "Standard local memory tier",
    maxLocalModelBytes: STUDIO_3D_LOCAL_STANDARD_MAX_BYTES,
    maxLocalConversionSourceBytes: STUDIO_3D_LOCAL_CONVERSION_STANDARD_MAX_BYTES,
    maxLocalTextSourceBytes: STUDIO_3D_LOCAL_TEXT_STANDARD_MAX_BYTES,
    maxLocalSkpSourceBytes: STUDIO_3D_LOCAL_SKP_STANDARD_MAX_BYTES,
    maxLocalBatchTotalBytes: STUDIO_3D_LOCAL_BATCH_STANDARD_MAX_BYTES,
    maxLocalSceneCumulativeBytes: STUDIO_3D_LOCAL_SCENE_STANDARD_MAX_BYTES,
    maxDecodedGeometryBytes: 512 * MIB,
    maxDecodedTextureBytes: 256 * MIB,
  }),
  "wasm64-balanced": Object.freeze({
    tierLabelKo: "Wasm64 · 균형 메모리 티어",
    tierLabelEn: "Wasm64 · Balanced memory tier",
    maxLocalModelBytes: STUDIO_3D_LOCAL_WASM64_BALANCED_MAX_BYTES,
    maxLocalConversionSourceBytes: STUDIO_3D_LOCAL_CONVERSION_WASM64_BALANCED_MAX_BYTES,
    maxLocalTextSourceBytes: STUDIO_3D_LOCAL_TEXT_WASM64_MAX_BYTES,
    maxLocalSkpSourceBytes: STUDIO_3D_LOCAL_SKP_WASM64_BALANCED_MAX_BYTES,
    maxLocalBatchTotalBytes: STUDIO_3D_LOCAL_BATCH_WASM64_BALANCED_MAX_BYTES,
    maxLocalSceneCumulativeBytes: STUDIO_3D_LOCAL_SCENE_WASM64_BALANCED_MAX_BYTES,
    maxDecodedGeometryBytes: 1 * GIB,
    maxDecodedTextureBytes: 512 * MIB,
  }),
  "wasm64-high-memory": Object.freeze({
    tierLabelKo: "Wasm64 · 대용량 로컬 OPFS 티어",
    tierLabelEn: "Wasm64 · High-memory local OPFS tier",
    maxLocalModelBytes: STUDIO_3D_LOCAL_WASM64_MAX_BYTES,
    maxLocalConversionSourceBytes: STUDIO_3D_LOCAL_CONVERSION_WASM64_MAX_BYTES,
    maxLocalTextSourceBytes: STUDIO_3D_LOCAL_TEXT_WASM64_MAX_BYTES,
    maxLocalSkpSourceBytes: STUDIO_3D_LOCAL_SKP_WASM64_MAX_BYTES,
    maxLocalBatchTotalBytes: STUDIO_3D_LOCAL_BATCH_WASM64_MAX_BYTES,
    maxLocalSceneCumulativeBytes: STUDIO_3D_LOCAL_SCENE_WASM64_MAX_BYTES,
    maxDecodedGeometryBytes: 1536 * MIB,
    maxDecodedTextureBytes: 1 * GIB,
  }),
});

/**
 * Wasm64 지원 여부·기기 메모리(`navigator.deviceMemory`)·디바이스 프로필을 종합해
 * 로컬 3D 업로드 및 임포트 수용 한도 정책을 계산한다.
 */
export function resolveStudio3dUploadLimitPolicy(
  signals: Studio3dRuntimeCapabilitySignals = {},
): Studio3dUploadLimitPolicy {
  const profile: Studio3dDeviceProfile = signals.profile === "mobile" ? "mobile" : "desktop";
  const isWasm64Supported = signals.isWasm64Supported ?? probeStudio3dWasm64Support({
    ...(signals.webAssembly !== undefined ? { webAssembly: signals.webAssembly } : {}),
  });
  const rawDeviceMemory = signals.deviceMemoryGb === undefined
    ? readStudio3dDeviceMemoryGb(signals.navigatorLike)
    : signals.deviceMemoryGb;
  const deviceMemoryGb =
    typeof rawDeviceMemory === "number" && Number.isFinite(rawDeviceMemory) && rawDeviceMemory > 0
      ? rawDeviceMemory
      : null;
  const opfsAvailable = signals.opfsAvailable ?? detectStudio3dOpfsAvailable(signals.navigatorLike);

  const tier = selectTier(profile, isWasm64Supported, deviceMemoryGb);
  const spec = TIER_SPECS[tier];

  return Object.freeze({
    tier,
    tierLabelKo: spec.tierLabelKo,
    tierLabelEn: spec.tierLabelEn,
    profile,
    isWasm64Supported,
    deviceMemoryGb,
    opfsAvailable,
    maxLocalModelBytes: spec.maxLocalModelBytes,
    maxLocalVrmBytes: spec.maxLocalModelBytes,
    maxLocalConversionSourceBytes: spec.maxLocalConversionSourceBytes,
    maxLocalTextSourceBytes: spec.maxLocalTextSourceBytes,
    maxLocalSkpSourceBytes: spec.maxLocalSkpSourceBytes,
    maxLocalBatchTotalBytes: spec.maxLocalBatchTotalBytes,
    maxLocalSceneCumulativeBytes: spec.maxLocalSceneCumulativeBytes,
    maxDecodedGeometryBytes: spec.maxDecodedGeometryBytes,
    maxDecodedTextureBytes: spec.maxDecodedTextureBytes,
    cloudWorkAsset3dMaxBytes: STUDIO_3D_CLOUD_WORK_ASSET_3D_MAX_BYTES,
    cloudAiInlineMaxBytes: STUDIO_3D_CLOUD_AI_INLINE_MAX_BYTES,
  });
}

/**
 * 선택한 3D 파일이 로컬 OPFS 작업 가능 범위인지, 클라우드 동기화 계약(12 MiB) 범위인지 판별한다.
 */
export function classifyStudio3dUploadTarget(
  byteSize: number,
  kind: "glb" | "vrm" | "background3d",
  policy: Studio3dUploadLimitPolicy = resolveStudio3dUploadLimitPolicy(),
): Studio3dUploadTargetClassification {
  const localMaxBytes = kind === "vrm" ? policy.maxLocalVrmBytes : policy.maxLocalModelBytes;
  const cloudMaxBytes = policy.cloudWorkAsset3dMaxBytes;
  const localLabel = formatStudio3dByteLimit(localMaxBytes);
  const cloudLabel = formatStudio3dByteLimit(cloudMaxBytes);

  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > localMaxBytes) {
    return Object.freeze({
      status: "exceeds-local-limit",
      localMaxBytes,
      cloudMaxBytes,
      summaryKo: `현재 환경(${policy.tierLabelKo})의 로컬 3D 작업 한도(${localLabel})를 초과했습니다. 모델을 최적화하거나 분할해 주세요.`,
      summaryEn: `Exceeds the local 3D limit (${localLabel}) for ${policy.tierLabelEn}. Please optimize or split the model.`,
    });
  }

  if (byteSize > cloudMaxBytes) {
    return Object.freeze({
      status: "local-opfs-only",
      localMaxBytes,
      cloudMaxBytes,
      summaryKo: `로컬 OPFS에서 즉시 편집할 수 있습니다(최대 ${localLabel}). 클라우드 팀 동기화는 파일당 ${cloudLabel}까지 지원합니다.`,
      summaryEn: `Ready for immediate local OPFS editing (up to ${localLabel}). Cloud team sync supports up to ${cloudLabel} per file.`,
    });
  }

  return Object.freeze({
    status: "local-and-cloud",
    localMaxBytes,
    cloudMaxBytes,
    summaryKo: `로컬 OPFS(최대 ${localLabel})와 클라우드 팀 동기화(${cloudLabel})를 모두 지원합니다.`,
    summaryEn: `Supported for both local OPFS (up to ${localLabel}) and cloud team sync (${cloudLabel}).`,
  });
}

/**
 * 3D 라이브러리·임포트 패널에서 현재 환경의 로컬 OPFS 수용 한도와 클라우드 동기화 경계를 안내한다.
 */
export function describeStudio3dLocalLimitBanner(
  policy: Studio3dUploadLimitPolicy,
  options?: { readonly includeSkp?: boolean; readonly includeCloudNote?: boolean },
): Studio3dLocalLimitBannerCopy {
  const modelLimit = formatStudio3dByteLimit(policy.maxLocalModelBytes);
  const convLimit = formatStudio3dByteLimit(policy.maxLocalConversionSourceBytes);
  const skpLimit = formatStudio3dByteLimit(policy.maxLocalSkpSourceBytes);
  const cloudLimit = formatStudio3dByteLimit(policy.cloudWorkAsset3dMaxBytes);
  const storageLabelKo = policy.opfsAvailable ? "로컬 OPFS 우선 저장" : "브라우저 로컬 세션";
  const storageLabelEn = policy.opfsAvailable ? "Local OPFS-first storage" : "Browser local session";
  const memorySuffixKo = policy.deviceMemoryGb !== null ? ` · 기기 메모리 ${policy.deviceMemoryGb} GiB` : "";
  const memorySuffixEn = policy.deviceMemoryGb !== null ? ` · ${policy.deviceMemoryGb} GiB device memory` : "";

  const headlineKo = `${policy.tierLabelKo} · ${storageLabelKo} (GLB·VRM 최대 ${modelLimit})`;
  const headlineEn = `${policy.tierLabelEn} · ${storageLabelEn} (GLB/VRM up to ${modelLimit})`;

  const detailPartsKo: string[] = [
    `GLB·VRM 최대 ${modelLimit}, OBJ·FBX·glTF 변환 원본 최대 ${convLimit}${options?.includeSkp ? `, SKP 최대 ${skpLimit}` : ""}${memorySuffixKo}까지 서버 전송 없이 기기에서 바로 작업할 수 있습니다.`,
  ];
  const detailPartsEn: string[] = [
    `Work locally without server upload: GLB/VRM up to ${modelLimit}, OBJ/FBX/glTF conversion sources up to ${convLimit}${options?.includeSkp ? `, SKP up to ${skpLimit}` : ""}${memorySuffixEn}.`,
  ];
  if (options?.includeCloudNote !== false) {
    detailPartsKo.push(
      `클라우드 팀 컷·작품 동기화는 파일당 ${cloudLimit} 이하 파일만 서버에 올라가며, 그보다 큰 대용량 모델은 로컬 OPFS 우선으로 보관·편집합니다.`,
    );
    detailPartsEn.push(
      `Cloud team cut / work sync uploads files up to ${cloudLimit} per file; larger models stay ready in local OPFS storage.`,
    );
  }

  return Object.freeze({
    headlineKo,
    detailKo: detailPartsKo.join(" "),
    headlineEn,
    detailEn: detailPartsEn.join(" "),
  });
}
