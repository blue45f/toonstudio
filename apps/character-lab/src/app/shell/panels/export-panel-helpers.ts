/**
 * ExportPanel 순수 표기·파일 읽기·클립보드 어댑터·레시피 텍스트 복원 보조 모듈.
 * 파일명을 소문자 하이픈(`export-panel-helpers.ts`)으로 두어 `app/composition.ts`의 최상위 패널 규칙을 지킨다.
 */
import { POSE_PRESETS } from "../../../animation/presets";
import {
  ALL_AVAILABLE_CAPABILITIES,
  ALL_UNAVAILABLE_CAPABILITIES,
  PART_ROLE_LABELS_KO,
  failVisible,
} from "../../../contracts";
import { deriveKitCapabilities } from "../../../domains/authored/kit-capability";
import { extractPaintState, parseRecipeFile, parseShaperPresetTextToRecipe } from "../../../export/recipe-file";
import { uploadReplacedLayers } from "../../../paint/paint-bridge";
import { kitPaintWarningsForLayers } from "../../../paint/paint-kit-warning";
import { recipeMigrationNoticeKo } from "../../../state/recipe-io";

import type { CameraFramingMode, CharacterEngine, CharacterRecipe, KitManifest, LabCommand, LabEvent, LabFailure, RecipeSource } from "../../../contracts";
import type { ExportReceipt } from "../../../export/export-session";
import type { PaintSession } from "../../../paint/paint-session";

export const FRAMING_LABELS_KO: Record<CameraFramingMode, string> = {
  "full-body": "전신",
  bust: "상반신",
  face: "얼굴",
  custom: "현재 카메라",
};

export function describeExportSourceKo(source: RecipeSource, isPackageRegistered: boolean): string {
  switch (source.kind) {
    case "kit":
      return `모듈식 키트 (${source.kitId} · ${source.baseId === "female" ? "여성 베이스" : "남성 베이스"})`;
    case "package":
      return `제작 패키지 (${source.characterId} · ${isPackageRegistered ? "등록됨" : "미로드"})`;
    case "procedural":
      return "절차적 휴머노이드";
    default: {
      const exhaustive: never = source;
      return String((exhaustive as { kind?: unknown }).kind);
    }
  }
}

export function describeExportPoseKo(recipe: CharacterRecipe): string {
  const boneCount = Object.keys(recipe.pose).length;
  const preset = POSE_PRESETS.find((item) => item.id === recipe.slots.pose);
  const handPresetId = recipe.slots["hand-pose"];
  const handSuffix = handPresetId ? ` · 손 ${handPresetId.replace("hand-pose/", "")}` : "";
  if (boneCount === 0) {
    return `기본 자세(Rest · 프리셋: ${preset?.labelKo ?? "없음"}${handSuffix})`;
  }
  if (preset) {
    return `${preset.labelKo} (본 ${boneCount}개${handSuffix})`;
  }
  return `사용자 편집 포즈 (본 ${boneCount}개${handSuffix})`;
}

export function readTextFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽을 수 없습니다."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  });
}

export function describeReceipt(receipt: ExportReceipt): string {
  const size = receipt.width && receipt.height ? ` · ${receipt.width}×${receipt.height}` : "";
  const psd = receipt.psd ? ` · 레이어 ${receipt.psd.layerCount}(그룹 ${receipt.psd.groupCount}) · 재합성 MAE ${receipt.psd.recomposeMae.toFixed(2)}` : "";
  return `${receipt.fileName} (${receipt.bytes.toLocaleString("ko-KR")} B${size}${psd} · ${receipt.durationMs} ms)`;
}

export function clampExportInt(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export async function defaultWriteClipboard(text: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    throw failVisible("clipboard-unavailable", "현재 브라우저 환경에서는 클립보드 쓰기 API를 사용할 수 없습니다.");
  }
  await navigator.clipboard.writeText(text);
}

export async function defaultReadClipboard(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
    throw failVisible("clipboard-unavailable", "현재 브라우저 환경에서는 클립보드 읽기 API를 사용할 수 없습니다.");
  }
  return navigator.clipboard.readText();
}

export interface ApplyImportedRecipeParams {
  readonly text: string;
  readonly sourceLabel: string;
  readonly forceShaperPreset?: boolean;
  readonly currentRecipe: CharacterRecipe;
  readonly now: number;
  readonly session: PaintSession;
  readonly engine: CharacterEngine | null;
  readonly dispatch: (cmd: LabCommand) => void;
  readonly applyStoreEvent: (event: LabEvent) => void;
  readonly getRegisteredPackage: (characterId: string) => { readonly glbSha256: string; readonly capabilities: LabStateCapabilities } | undefined;
  readonly peekKitManifest: ((source: Extract<RecipeSource, { readonly kind: "kit" }>) => KitManifest | undefined) | undefined;
}

type LabStateCapabilities = typeof ALL_AVAILABLE_CAPABILITIES;

export async function applyImportedRecipeText(
  params: ApplyImportedRecipeParams,
): Promise<
  | { readonly ok: true; readonly notices: readonly string[]; readonly receipt: ExportReceipt }
  | { readonly ok: false; readonly failure: LabFailure }
> {
  const {
    text,
    sourceLabel,
    forceShaperPreset,
    currentRecipe,
    now,
    session,
    engine,
    dispatch,
    applyStoreEvent,
    getRegisteredPackage,
    peekKitManifest,
  } = params;

  const trimmed = text.trim();
  const isShaperPreset = forceShaperPreset ?? (!trimmed.startsWith("{") && trimmed.startsWith("1."));
  const parsed = isShaperPreset
    ? parseShaperPresetTextToRecipe(text, currentRecipe, now)
    : parseRecipeFile(text, now);
  if (!parsed.ok) {
    return { ok: false, failure: parsed.failure };
  }

  const paint = await extractPaintState(parsed.recipe, now);
  const firstFailure = paint.failures[0];
  if (firstFailure) {
    return { ok: false, failure: firstFailure };
  }

  const importNotices: string[] = [];
  if (isShaperPreset) {
    importNotices.push("SHAPER 프리셋 파일을 현재 형식(v3)으로 변환해 열었습니다.");
  }
  const migrationNotice = recipeMigrationNoticeKo(parsed);
  if (migrationNotice !== null) importNotices.push(migrationNotice);

  dispatch({ type: "recipe/load", recipe: parsed.recipe });
  const nextSource = parsed.recipe.source;
  if (nextSource.kind === "procedural") {
    if (!engine) {
      applyStoreEvent({ type: "source/capabilities", capabilities: ALL_AVAILABLE_CAPABILITIES });
    }
  } else if (nextSource.kind === "package") {
    const registered = getRegisteredPackage(nextSource.characterId);
    if (!registered) {
      if (!engine) {
        applyStoreEvent({ type: "source/capabilities", capabilities: ALL_UNAVAILABLE_CAPABILITIES });
      }
      importNotices.push(
        `제작 패키지 '${nextSource.characterId}'가 아직 로드되지 않았습니다. 제작 패키지 탭에서 해당 패키지를 불러오면 스켈레톤·슬롯 능력이 활성화됩니다.`,
      );
    } else if (registered.glbSha256 !== nextSource.sha256) {
      if (!engine) {
        applyStoreEvent({ type: "source/capabilities", capabilities: ALL_UNAVAILABLE_CAPABILITIES });
      }
      importNotices.push(
        `제작 패키지 '${nextSource.characterId}'의 GLB SHA-256이 현재 등록된 패키지와 다릅니다. 제작 패키지 탭에서 다시 불러오세요.`,
      );
    } else if (!engine) {
      applyStoreEvent({ type: "source/capabilities", capabilities: registered.capabilities });
    }
  } else if (nextSource.kind === "kit" && !engine) {
    const manifest = peekKitManifest?.(nextSource);
    if (manifest && manifest.bases[nextSource.baseId]) {
      applyStoreEvent({ type: "source/capabilities", capabilities: deriveKitCapabilities(manifest, nextSource.baseId) });
    }
  }

  if (!isShaperPreset || paint.layers.length > 0 || paint.sublayers.length > 0) {
    const previousLayers = session.layersForExport();
    session.replacePaintState({ layers: paint.layers, sublayers: paint.sublayers });
    if (engine) uploadReplacedLayers(previousLayers, session.layersForExport(), (layer) => engine.updatePaintTexture(layer));
  }

  const restoredLayers = session.layersForExport();
  const warnTargetLayers = restoredLayers.length > 0 ? restoredLayers : paint.layers;
  for (const warning of kitPaintWarningsForLayers(parsed.recipe.source.kind, warnTargetLayers)) {
    importNotices.push(`이미 칠한 ${PART_ROLE_LABELS_KO[warning.part]} 레이어: ${warning.messageKo}`);
  }

  return {
    ok: true,
    notices: importNotices,
    receipt: { kind: "recipe", fileName: sourceLabel, mime: "application/json", bytes: text.length, durationMs: 0 },
  };
}
