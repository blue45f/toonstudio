/**
 * ExportPanel 순수 표기·파일 읽기·클립보드 어댑터·레시피 텍스트 안전 복원 보조 모듈.
 * 파일명을 소문자 하이픈(`export-panel-helpers.ts`)으로 두어 `app/composition.ts`의 최상위 패널 규칙을 지킨다.
 *
 * 불러오기 안전 불변식:
 * 1. JSON 파싱·중복 키/ID·스키마·페인트 PNG 디코드·소스 에셋(키트/패키지 해시·등록) 검증이 모두 통과하기 전에는
 *    `store`(`recipe/load`)와 `PaintSession`(`replacePaintState`)을 절대 건드리지 않는다.
 * 2. 적용 도중 예외가 발생해도 스냅샷으로 페인트 서브레이어·엔진 텍스처를 원자적으로 되돌려 현재 작업을 보존한다.
 */
import { POSE_PRESETS } from "../../../animation/presets";
import {
  ALL_AVAILABLE_CAPABILITIES,
  ALL_UNAVAILABLE_CAPABILITIES,
  CHARACTER_SLOT_KINDS,
  PAINTABLE_PART_ROLES,
  PART_ROLE_LABELS_KO,
  SLOT_LABELS_KO,
  WARDROBE_LAYERS,
  WARDROBE_LAYER_LABELS_KO,
  failVisible,
  isLabFailure,
} from "../../../contracts";
import { deriveKitCapabilities } from "../../../domains/authored/kit-capability";
import { extractPaintState, parseRecipeFile, parseShaperPresetTextToRecipe } from "../../../export/recipe-file";
import { uploadReplacedLayers } from "../../../paint/paint-bridge";
import { kitPaintWarningsForLayers } from "../../../paint/paint-kit-warning";
import { stripUtf8Bom } from "../../../shared/json-safety";
import { recipeMigrationNoticeKo } from "../../../state/recipe-io";

import type {
  CameraFramingMode,
  CharacterEngine,
  CharacterRecipe,
  KitManifest,
  LabCommand,
  LabEvent,
  LabFailure,
  PaintLayer,
  PaintPartSublayerState,
  PartRole,
  PresetCatalog,
  RecipeSource,
} from "../../../contracts";
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

export function collectMissingCatalogNoticesKo(recipe: CharacterRecipe, catalog: PresetCatalog | undefined): string[] {
  if (!catalog || catalog.entries.length === 0) return [];
  const notices: string[] = [];
  for (const slot of CHARACTER_SLOT_KINDS) {
    const presetId = recipe.slots[slot];
    if (presetId !== null && !catalog.get(presetId)) {
      notices.push(
        `카탈로그에 없는 프리셋 '${presetId}'(${SLOT_LABELS_KO[slot]})이 포함되어 있어 대체 없이 미적용 상태로 열렸습니다.`,
      );
    }
  }
  for (const layer of WARDROBE_LAYERS) {
    const presetId = recipe.wardrobe[layer];
    if (presetId !== null && !catalog.get(presetId)) {
      notices.push(
        `카탈로그에 없는 의상 프리셋 '${presetId}'(${WARDROBE_LAYER_LABELS_KO[layer]} 층)이 포함되어 있어 미적용 상태로 열렸습니다.`,
      );
    }
  }
  for (const acc of recipe.wardrobe.accessories) {
    if (!catalog.get(acc.presetId)) {
      notices.push(
        `카탈로그에 없는 소품 프리셋 '${acc.presetId}'(${acc.id})이 포함되어 있어 숨김 상태로 열렸습니다.`,
      );
    }
  }
  return notices;
}

function collectLegacyPaintRecoveryNoticesKo(
  migratedFrom: number | undefined,
  layers: readonly PaintLayer[],
  sublayers: readonly PaintPartSublayerState[],
): string[] {
  const notices: string[] = [];
  if (migratedFrom !== undefined && layers.length > 0 && sublayers.length === 0) {
    notices.push(
      `구버전(v${migratedFrom}) 단일 페인트 레이어 ${layers.length}개를 다중 서브레이어 기본 슬롯(L0)으로 복구해 보존했습니다.`,
    );
  }
  const paintableSet = new Set<string>(PAINTABLE_PART_ROLES);
  const nonStandardParts: PartRole[] = [];
  const seen = new Set<PartRole>();
  for (const layer of layers) {
    if (!paintableSet.has(layer.part) && layer.rgba.some((b) => b !== 0) && !seen.has(layer.part)) {
      seen.add(layer.part);
      nonStandardParts.push(layer.part);
    }
  }
  for (const sub of sublayers) {
    const hasSubData = sub.slots.some((s) => s.rgba !== null && s.rgba.some((b) => b !== 0));
    if (!paintableSet.has(sub.part) && hasSubData && !seen.has(sub.part)) {
      seen.add(sub.part);
      nonStandardParts.push(sub.part);
    }
  }
  if (nonStandardParts.length > 0) {
    const labels = nonStandardParts.map((part) => PART_ROLE_LABELS_KO[part]).join(", ");
    notices.push(`구버전 비표준 부위(${labels}) 페인트 레이어를 손실 없이 보존했습니다. 페인트 탭에서 확인하거나 비울 수 있습니다.`);
  }
  return notices;
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
  readonly catalog?: PresetCatalog;
  readonly validateKitRecipe?: ((recipe: CharacterRecipe) => Promise<unknown>) | undefined;
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
    catalog,
    validateKitRecipe,
  } = params;

  const { text: withoutBom } = stripUtf8Bom(text);
  const trimmed = withoutBom.trim();
  const isShaperPreset =
    forceShaperPreset ?? (!trimmed.startsWith("{") && !trimmed.startsWith("[") && trimmed.startsWith("1."));
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

  const nextSource = parsed.recipe.source;
  if (nextSource.kind === "package") {
    const registered = getRegisteredPackage(nextSource.characterId);
    if (registered && registered.glbSha256 !== nextSource.sha256) {
      return {
        ok: false,
        failure: failVisible(
          "package-sha-mismatch",
          `제작 패키지 '${nextSource.characterId}'의 GLB SHA-256 해시가 현재 등록된 패키지와 일치하지 않아 현재 작업을 보호하기 위해 불러오기를 중단했습니다. '제작 패키지' 탭에서 올바른 버전을 다시 등록하세요.`,
          undefined,
          now,
        ),
      };
    }
    if (!registered && engine !== null) {
      return {
        ok: false,
        failure: failVisible(
          "package-plan-missing",
          `제작 패키지 '${nextSource.characterId}'가 아직 로드되지 않아 현재 3D 작업을 보호하기 위해 불러오기를 중단했습니다. 먼저 '제작 패키지' 탭에서 해당 패키지를 불러온 뒤 다시 레시피를 여세요.`,
          undefined,
          now,
        ),
      };
    }
  } else if (nextSource.kind === "kit" && validateKitRecipe) {
    try {
      await validateKitRecipe(parsed.recipe);
    } catch (error) {
      return {
        ok: false,
        failure: isLabFailure(error)
          ? error
          : failVisible(
              "kit-manifest-fetch-failed",
              `키트 에셋('${nextSource.kitId}')을 확인하지 못해 현재 작업을 유지하고 불러오기를 중단했습니다.`,
              error,
              now,
            ),
      };
    }
  }

  const importNotices: string[] = [];
  if (isShaperPreset) {
    importNotices.push("SHAPER 프리셋 파일을 현재 형식(v3)으로 변환해 열었습니다.");
  }
  const migrationNotice = recipeMigrationNoticeKo(parsed);
  if (migrationNotice !== null) importNotices.push(migrationNotice);
  importNotices.push(...collectLegacyPaintRecoveryNoticesKo(parsed.migratedFrom, paint.layers, paint.sublayers));
  importNotices.push(...collectMissingCatalogNoticesKo(parsed.recipe, catalog));

  const previousPaintLayers = session.layersForExport();
  const previousPaintSublayers = session.sublayersForExport();
  const shouldReplacePaint = !isShaperPreset || paint.layers.length > 0 || paint.sublayers.length > 0;
  let paintMutated = false;

  try {
    dispatch({ type: "recipe/load", recipe: parsed.recipe });
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
      } else if (!engine) {
        applyStoreEvent({ type: "source/capabilities", capabilities: registered.capabilities });
      }
    } else if (nextSource.kind === "kit" && !engine) {
      const manifest = peekKitManifest?.(nextSource);
      if (manifest && manifest.bases[nextSource.baseId]) {
        applyStoreEvent({ type: "source/capabilities", capabilities: deriveKitCapabilities(manifest, nextSource.baseId) });
      }
    }

    if (shouldReplacePaint) {
      session.replacePaintState({ layers: paint.layers, sublayers: paint.sublayers });
      paintMutated = true;
      if (engine) {
        uploadReplacedLayers(previousPaintLayers, session.layersForExport(), (layer) => engine.updatePaintTexture(layer));
      }
    }
  } catch (error) {
    if (paintMutated) {
      session.replacePaintState({ layers: previousPaintLayers, sublayers: previousPaintSublayers });
      if (engine) {
        uploadReplacedLayers(paint.layers, session.layersForExport(), (layer) => engine.updatePaintTexture(layer));
      }
    }
    return {
      ok: false,
      failure: isLabFailure(error)
        ? error
        : failVisible(
            "recipe-import-apply-failed",
            "레시피를 적용하는 중 예기치 않은 오류가 발생해 이전 페인트 상태를 그대로 복구했습니다.",
            error,
            now,
          ),
    };
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
