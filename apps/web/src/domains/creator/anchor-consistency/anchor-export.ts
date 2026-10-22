/**
 * 앵커 세트 내보내기 — 이미지, 메타데이터, 권리 확인, 참조 팩 문서를 하나의 ZIP 으로 묶는다.
 *
 * 상태: current. 순수 계산(`planAnchorExport`)과 ZIP 만들기(`buildAnchorExportZip`)를 나눴다. 계획은 DOM 에 닿지 않고,
 * ZIP 만들기는 기존 패키지 아카이브 작성기(`studio-package-archive`, 저장 방식 ZIP32·CRC-32)를 쓴다.
 *
 * 규칙
 * - 같은 입력은 항상 같은 바이트를 만든다. 생성 시각을 파일 안에 넣지 않고 ZIP 시각은 고정 값이다. 시각은 `rights.json` 의
 *   확인 시각에만 남는다(세트 해시에는 들어가지 않는다).
 * - 권리 확인(`AnchorRights`)이 없으면 만들지 않는다. 확인 문장은 `rights.json`·`anchor-set.json`·`README.txt` 에 모두 남는다.
 * - 참조 팩 문서는 기존 형식(v1)에 앵커·샷 참조를 더한 결과이고 이진 데이터를 담지 않는다(소재 id 와 SHA-256 만).
 * - README 와 안내문은 일관성을 보장하지 않는다는 사실을 함께 적는다.
 */

import { buildStudioPackageArchiveBlob, type StudioPackageArchiveEntry } from "../studio-package-archive";
import type { StudioCrc32ExecutionMode } from "../studio-crc32-worker-client";

import {
  ANCHOR_CAPTURE_CONVENTION,
  ANCHOR_LIMITS,
  anchorImageExtension,
  type AnchorAngleId,
} from "./anchor-capture-spec";
import {
  anchorImageFileName,
  checkAnchorCompleteness,
  type AnchorCaptureSet,
  type AnchorCompletenessReport,
} from "./anchor-capture-set";
import type { AnchorCapturedFrame, AnchorFrameOrigin } from "./anchor-capture-session";
import {
  addAnchorReferencesToPack,
  type AnchorReferencePackResult,
  type AnchorShotCaptureInput,
} from "./anchor-reference-pack";
import { ANCHOR_RIGHTS_STATEMENT_KO, type AnchorRights } from "./anchor-rights";

export const ANCHOR_EXPORT_SCHEMA = "toonstudio.anchor-export" as const;
export const ANCHOR_REFERENCE_PACK_SCHEMA = "toonstudio.anchor-reference-pack" as const;

export const ANCHOR_EXPORT_PATHS = Object.freeze({
  manifest: "anchor-set.json",
  rights: "rights.json",
  referencePack: "reference-pack.json",
  readme: "README.txt",
  imagesDir: "images/",
  shotsDir: "shots/",
});

/** 내보낸 파일에 남기는 한계 안내(데이터). 화면 문구는 번역 키가 따로 가진다. */
export const ANCHOR_EXPORT_NOTICE_KO =
  "이 앵커 세트는 같은 가상 캐릭터를 컷마다 비슷하게 그리도록 돕는 참조 이미지 묶음이에요. 생성 결과가 같은 캐릭터로 그려진다는 보장은 없고, 후보와의 참고 점수는 같은 캐릭터인지 판정하는 값이 아니에요.";

/** 샷 포즈·구도 이미지 한 장(바이트 포함). 참조 팩 입력과 ZIP 에 같은 값을 쓴다. */
export interface AnchorShotFrame {
  readonly capture: AnchorShotCaptureInput;
  readonly bytes: Uint8Array;
}

export interface AnchorExportInput {
  readonly set: AnchorCaptureSet;
  readonly frames: readonly AnchorCapturedFrame[];
  readonly rights: AnchorRights;
  readonly origin: AnchorFrameOrigin;
  readonly shots?: readonly AnchorShotFrame[];
  /** 참조 팩 라벨에 쓸 번역된 각도 이름(기본은 한국어 이름). */
  readonly angleLabels?: Partial<Readonly<Record<AnchorAngleId, string>>>;
}

export interface AnchorExportFile {
  readonly path: string;
  readonly data: Uint8Array | string;
}

export interface AnchorExportPlan {
  readonly fileName: string;
  readonly files: readonly AnchorExportFile[];
  readonly completeness: AnchorCompletenessReport;
  readonly referencePack: AnchorReferencePackResult;
}

function shotFileName(shot: AnchorShotCaptureInput): string {
  return `${shot.shotId}.${shot.kind}.${shot.imageSha256.slice(0, 8)}.${anchorImageExtension(shot.mimeType)}`;
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readmeText(set: AnchorCaptureSet, shotCount: number): string {
  return [
    `캐릭터 앵커 세트 · ${set.anchorId}`,
    "",
    ANCHOR_EXPORT_NOTICE_KO,
    "",
    "[권리 확인]",
    ANCHOR_RIGHTS_STATEMENT_KO,
    "이 도구는 얼굴 인식과 생체 정보 추출을 쓰지 않아요. 모든 처리는 사용자의 기기 안에서 끝났어요.",
    "",
    "[들어 있는 것]",
    `- ${ANCHOR_EXPORT_PATHS.imagesDir} : 앵커 이미지 ${set.entries.length}장 (파일 이름 규칙: <앵커id>.<각도>.<해시 8자>.<확장자>)`,
    ...(shotCount > 0 ? [`- ${ANCHOR_EXPORT_PATHS.shotsDir} : 샷 포즈·구도 이미지 ${shotCount}장`] : []),
    `- ${ANCHOR_EXPORT_PATHS.manifest} : 세트 정보. setHash 는 앵커 id·원본 캐릭터 id·각도·이미지 내용에서만 계산하고 생성 시각은 넣지 않아요.`,
    `- ${ANCHOR_EXPORT_PATHS.rights} : 권리 확인 기록`,
    `- ${ANCHOR_EXPORT_PATHS.referencePack} : AI 컴포저 이미지 참조 팩(v1) 형식의 문서와 소재 초안. 이진 데이터는 담지 않아요.`,
    "",
    "[각도 규약]",
    "정면 0°, 좌 3/4 -45°, 좌측 -90°, 후면 180°, 우측 +90°, 우 3/4 +45°. 좌우는 캐릭터 몸 기준이에요.",
    `권장 캡처: ${ANCHOR_CAPTURE_CONVENTION.frame.width}×${ANCHOR_CAPTURE_CONVENTION.frame.height}px, 시야각 ${ANCHOR_CAPTURE_CONVENTION.camera.verticalFovDeg}°, 단색 배경 ${ANCHOR_CAPTURE_CONVENTION.background.hex}.`,
    "",
    "[참조 팩에 넣는 법]",
    "AI 컴포저에 바로 가져오는 연결은 아직 없어요. reference-pack.json 의 assets 항목을 소재로 저장할 때의 메타데이터로 쓰고,",
    "images/ 의 이미지를 같은 해시의 소재로 올린 뒤 document 의 참조를 맞춰 주세요.",
    "",
  ].join("\n");
}

/** 내보낼 파일 목록과 참조 팩 결과를 계산한다. 같은 입력이면 같은 결과다. */
export function planAnchorExport(input: AnchorExportInput): AnchorExportPlan {
  const byAngle = new Map(input.frames.map((frame) => [frame.angleId, frame] as const));
  const shots = input.shots ?? [];
  const completeness = checkAnchorCompleteness(input.set.entries);
  const referencePack = addAnchorReferencesToPack({
    document: null,
    anchorSet: input.set,
    shotCaptures: shots.map((shot) => shot.capture),
    rights: input.rights,
    origin: input.origin,
    ...(input.angleLabels ? { angleLabels: input.angleLabels } : {}),
  });

  const files: AnchorExportFile[] = [];
  for (const entry of input.set.entries) {
    const frame = byAngle.get(entry.angleId);
    if (!frame || frame.imageSha256 !== entry.imageSha256) {
      throw new RangeError(`앵커 세트의 ${entry.angleId} 이미지가 프레임과 맞지 않아요. 세트를 다시 만들어 주세요.`);
    }
    files.push({ path: `${ANCHOR_EXPORT_PATHS.imagesDir}${entry.fileName}`, data: frame.bytes });
  }
  const shotEntries = shots.map((shot) => ({
    shotId: shot.capture.shotId,
    kind: shot.capture.kind,
    file: `${ANCHOR_EXPORT_PATHS.shotsDir}${shotFileName(shot.capture)}`,
    mimeType: shot.capture.mimeType,
    width: shot.capture.width,
    height: shot.capture.height,
    byteLength: shot.capture.byteLength,
    imageSha256: shot.capture.imageSha256,
  }));
  shots.forEach((shot, index) => {
    const entry = shotEntries[index];
    if (entry) files.push({ path: entry.file, data: shot.bytes });
  });

  const manifest = {
    schema: ANCHOR_EXPORT_SCHEMA,
    specVersion: input.set.specVersion,
    anchorId: input.set.anchorId,
    sourceCharacterId: input.set.sourceCharacterId,
    setHash: input.set.setHash,
    convention: ANCHOR_CAPTURE_CONVENTION,
    limits: ANCHOR_LIMITS,
    entries: input.set.entries.map((entry) => ({
      angleId: entry.angleId,
      azimuthDeg: entry.azimuthDeg,
      file: `${ANCHOR_EXPORT_PATHS.imagesDir}${entry.fileName}`,
      mimeType: entry.mimeType,
      width: entry.width,
      height: entry.height,
      byteLength: entry.byteLength,
      imageSha256: entry.imageSha256,
      entryHash: entry.entryHash,
      origin: byAngle.get(entry.angleId)?.origin ?? input.origin,
    })),
    shots: shotEntries,
    completeness: {
      status: completeness.status,
      present: completeness.present,
      missing: completeness.missing,
      issues: completeness.issues.map((issue) => ({
        code: issue.code,
        severity: issue.severity,
        angleId: issue.angleId,
        ...(issue.relatedAngleId ? { relatedAngleId: issue.relatedAngleId } : {}),
      })),
    },
    rights: { statement: input.rights.statement, virtualCharacterOnly: true, biometricProcessing: "none" },
    notice: ANCHOR_EXPORT_NOTICE_KO,
  };
  const pack = {
    schema: ANCHOR_REFERENCE_PACK_SCHEMA,
    version: 1,
    anchorId: input.set.anchorId,
    setHash: input.set.setHash,
    document: referencePack.document,
    assets: referencePack.assets,
    added: referencePack.added,
    skipped: referencePack.skipped,
    warnings: referencePack.warnings,
    usage: referencePack.usage,
    notice: ANCHOR_EXPORT_NOTICE_KO,
  };
  files.push(
    { path: ANCHOR_EXPORT_PATHS.manifest, data: jsonText(manifest) },
    { path: ANCHOR_EXPORT_PATHS.rights, data: jsonText(input.rights) },
    { path: ANCHOR_EXPORT_PATHS.referencePack, data: jsonText(pack) },
    { path: ANCHOR_EXPORT_PATHS.readme, data: readmeText(input.set, shots.length) },
  );
  return Object.freeze({
    fileName: `${input.set.anchorId}.anchor-set.${input.set.setHash.slice(0, 8)}.zip`,
    files: Object.freeze(files),
    completeness,
    referencePack,
  });
}

export interface BuildAnchorExportOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: { readonly completedFiles: number; readonly totalFiles: number }) => void;
  /** 브라우저에서는 `worker`(기본), 시험에서는 `direct-headless`. */
  readonly crc32ExecutionMode?: StudioCrc32ExecutionMode;
}

export interface AnchorExportZip {
  readonly fileName: string;
  readonly blob: Blob;
  readonly plan: AnchorExportPlan;
}

/** 계획한 파일을 ZIP Blob 으로 묶는다. 취소하면 AbortError 로 끝난다. */
export async function buildAnchorExportZip(
  input: AnchorExportInput,
  options: BuildAnchorExportOptions = {},
): Promise<AnchorExportZip> {
  const plan = planAnchorExport(input);
  const encoder = new TextEncoder();
  // 인코더가 돌려준 배열을 이 실행 환경의 Uint8Array 로 한 번 복사한다. 아카이브 작성기가 instanceof 로 원본을 판별해서,
  // 다른 전역(테스트의 jsdom 등)에서 만든 배열은 받지 않는다.
  const entries: StudioPackageArchiveEntry[] = plan.files.map((file) => ({
    path: file.path,
    data: typeof file.data === "string" ? new Uint8Array(encoder.encode(file.data)) : file.data,
  }));
  const blob = await buildStudioPackageArchiveBlob(entries, {
    mimeType: "application/zip",
    crc32ExecutionMode: options.crc32ExecutionMode ?? "worker",
    ...(options.signal ? { signal: options.signal } : {}),
    onProgress: (progress) => {
      options.onProgress?.({ completedFiles: progress.completedFiles, totalFiles: progress.totalFiles });
    },
  });
  return Object.freeze({ fileName: plan.fileName, blob, plan });
}

/** 한 각도의 원본 이미지를 내려받기용으로 준비한다. 형식은 원본 그대로이고 이름은 세트 파일 이름 규칙을 따른다. */
export function anchorFrameDownload(anchorId: string, frame: AnchorCapturedFrame): { readonly blob: Blob; readonly fileName: string } {
  return {
    blob: new Blob([frame.bytes.slice()], { type: frame.mimeType }),
    fileName: anchorImageFileName({ anchorId, angleId: frame.angleId, imageSha256: frame.imageSha256, mimeType: frame.mimeType }),
  };
}
