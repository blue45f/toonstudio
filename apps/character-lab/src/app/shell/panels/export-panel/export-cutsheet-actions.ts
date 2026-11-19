import { failVisible } from "../../../../contracts";
import { selectAuthoredPackageRevision } from "../../../../domains/authored/package-index";
import {
  CUTSHEET_MIME,
  episodeCutsheetFileName,
  parseEpisodeCutsheet,
  serializeEpisodeCutsheet,
} from "../../../../export/webtoon-episode-cutsheet";
import { planApply } from "../../../../state/apply-plan";
import { browserPackageLoader } from "../package-panel/browser-package-loader";
import { findWebtoonSceneDirectorPreset } from "../viewport-scene-director";

import type { ApplyPlan, CameraFraming, CharacterEngine, CharacterRecipe, LabFailure, LabState, PresetCatalog } from "../../../../contracts";
import type { ExportPsdOptions, ExportReceipt } from "../../../../export/export-session";
import type { EpisodeCutsheetStore } from "../../../../export/webtoon-episode-cutsheet";
import type { ExportWebtoonVerticalStripOptions } from "../../../../export/webtoon-strip-composer";
import type { PackagePlanRegistry } from "../../package-plan-registry";
import type { StripDirectorSession, StripDirectorState, WebtoonSceneDirectorPresetId } from "../viewport-scene-director";

export function resolveHairSplitReasonKo(
  hairSupport: ReturnType<NonNullable<CharacterEngine["psdHairLayers"]>> | undefined,
): string | null {
  if (hairSupport?.status === "available") return null;
  return hairSupport?.reasonKo ?? "현재 엔진은 기하학적 헤어 분리를 지원하지 않습니다. 헤어 분리를 끄고 일반 PSD로 저장할 수 있습니다.";
}

export async function ensureBrowserPackageRegistered(params: {
  readonly characterId: string;
  readonly expectedSha256: string;
  readonly packagePlans: PackagePlanRegistry;
  readonly fallbackCapabilities: LabState["capabilities"];
}): Promise<{ readonly glbSha256: string; readonly capabilities: LabState["capabilities"] } | undefined> {
  const { characterId, expectedSha256, packagePlans, fallbackCapabilities } = params;
  const existing = packagePlans.get(characterId, expectedSha256);
  if (existing) return existing;
  const anyRegistered = packagePlans.get(characterId);
  if (typeof fetch !== "function") return anyRegistered;
  try {
    const indexResult = await browserPackageLoader.loadIndex();
    if (!indexResult.ok) return anyRegistered;
    const entry = indexResult.entries.find((item) => item.characterId === characterId);
    if (!entry) return anyRegistered;
    const revision = selectAuthoredPackageRevision(entry, expectedSha256);
    if (!revision) {
      return entry.glbSha256 ? { glbSha256: entry.glbSha256, capabilities: fallbackCapabilities } : anyRegistered;
    }
    const loaded = await browserPackageLoader.loadPackage(revision, { preferredLod: 0 });
    if (!loaded.ok) return anyRegistered;
    if (loaded.plan.manifest.characterId !== characterId) return anyRegistered;
    if (loaded.plan.glbSha256 !== expectedSha256) {
      return { glbSha256: loaded.plan.glbSha256, capabilities: loaded.plan.capabilities };
    }
    packagePlans.register(loaded.plan);
    return { glbSha256: loaded.plan.glbSha256, capabilities: loaded.plan.capabilities };
  } catch {
    return anyRegistered;
  }
}

export interface ReaderPreviewState {
  readonly url: string;
  readonly revocable: boolean;
  readonly width: number;
  readonly height: number;
}

export function bytesToPreviewUrl(bytes: Uint8Array, mime: string): { readonly url: string; readonly revocable: boolean } {
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blobUrl = URL.createObjectURL(new Blob([copy], { type: mime }));
    if (blobUrl) return { url: blobUrl, revocable: true };
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  const encoded = typeof btoa === "function" ? btoa(binary) : "";
  return { url: `data:${mime};base64,${encoded}`, revocable: false };
}

export function revokePreviewState(preview: ReaderPreviewState | null): void {
  if (preview?.revocable && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(preview.url);
  }
}

export function buildStripExportOptions(params: {
  readonly width: number;
  readonly settleSteps: number;
  readonly directorState: StripDirectorState;
  readonly applyPlan: ApplyPlan | null | undefined;
  readonly recipe: CharacterRecipe;
  readonly capabilities: LabState["capabilities"];
  readonly catalog: PresetCatalog;
  readonly onProgress: (step: number, total: number, labelKo: string) => void;
}): ExportWebtoonVerticalStripOptions {
  const { width, settleSteps, directorState, applyPlan, recipe, capabilities, catalog, onProgress } = params;
  const effectiveBasePlan = applyPlan ?? planApply(recipe, capabilities, catalog);
  const {
    locale: stripLocale,
    jaWritingMode,
    manuscriptMood,
    gutterPaces,
    screentones,
    actingArc: stripActingArc,
    bakeStripFx,
    stripFxLines,
    dialogueLines,
    bubbleShapes,
    bubbleFontScales,
    sfxStamps,
    speakerTargets,
    cutCameraPresets,
    partnerSide,
  } = directorState;
  return {
    stripWidth: width,
    includeBubbleSafeZone: true,
    gutterPaces,
    manuscriptMood,
    screentones,
    cutCameraPresets,
    ...(stripActingArc !== "none"
      ? {
          actingArc: {
            arcId: stripActingArc,
            basePlan: effectiveBasePlan,
          },
        }
      : {}),
    ...(bakeStripFx
      ? {
          mangaFx: {
            enabled: true,
            locale: stripLocale,
            jaWritingMode,
            manuscriptMood,
            screentones,
            linesKind: stripFxLines,
            includeSpeechBubbles: true,
            intensity: 0.78,
            dialogueLines,
            bubbleShapes,
            bubbleFontScales,
            sfxStamps,
            speakerTargets,
            partnerSide,
          },
        }
      : {}),
    settleSteps,
    onProgress,
  };
}

export function buildLayeredPsdOptions(params: {
  readonly width: number;
  readonly height: number;
  readonly framing: CameraFraming;
  readonly settleSteps: number;
  readonly includeIdMasks: boolean;
  readonly includeReferencePasses: boolean;
  readonly splitHairLayers: boolean;
  readonly useLuminanceToAlpha: boolean;
  readonly directorState: StripDirectorState;
}): ExportPsdOptions {
  const {
    width,
    height,
    framing,
    settleSteps,
    includeIdMasks,
    includeReferencePasses,
    splitHairLayers,
    useLuminanceToAlpha,
    directorState,
  } = params;
  return {
    width,
    height,
    framing,
    settleSteps,
    includeIdMasks,
    includeReferencePasses,
    splitHairLayers,
    ...(useLuminanceToAlpha ? { lineArt: { useLuminanceToAlpha: true } } : {}),
    ...(directorState.includePsdMangaFx
      ? {
          mangaFx: {
            enabled: true,
            locale: directorState.locale,
            jaWritingMode: directorState.jaWritingMode,
            screentone: directorState.screentones[0],
            linesKind: directorState.stripFxLines,
            bubbleShape: directorState.bubbleShapes[0],
            dialogueText: directorState.dialogueLines[0],
            fontScale: directorState.bubbleFontScales[0],
            speakerTarget: directorState.speakerTargets[0] === "auto" ? "protagonist" : directorState.speakerTargets[0],
            partnerSide: directorState.partnerSide,
            sfxStamp: directorState.sfxStamps[0],
            intensity: 0.78,
          },
        }
      : {}),
  };
}

export type CutsheetSaveOutcome =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array;
      readonly receipt: ExportReceipt;
      readonly noticeKo: string;
    }
  | {
      readonly ok: false;
      readonly failure: LabFailure;
    };

export function buildSavedCutsheetOutcome(
  cutsheetStore: EpisodeCutsheetStore,
  now: () => number,
): CutsheetSaveOutcome {
  const started = now();
  const cs = cutsheetStore.getState();
  if (cs.beats.length === 0) {
    return {
      ok: false,
      failure: failVisible("cutsheet-beats-empty", "큐시트에 등록된 4컷 씬 비트가 없어 저장할 수 없습니다.", undefined, started),
    };
  }
  const text = serializeEpisodeCutsheet(cs.episodeTitleKo, cs.beats, started);
  const bytes = new TextEncoder().encode(text);
  const fileName = episodeCutsheetFileName(cs.episodeTitleKo, cs.beats.length);
  return {
    ok: true,
    bytes,
    receipt: {
      kind: "cutsheet",
      fileName,
      mime: CUTSHEET_MIME,
      bytes: bytes.length,
      durationMs: now() - started,
    },
    noticeKo: `에피소드 콘티 큐시트(${cs.beats.length}비트 · ${cs.beats.length * 4}컷)를 저장했습니다.`,
  };
}

export type CutsheetLoadOutcome =
  | {
      readonly ok: true;
      readonly receipt: ExportReceipt;
      readonly noticeKo: string;
    }
  | {
      readonly ok: false;
      readonly failure: LabFailure;
    };

export async function loadAndApplyCutsheetFile(params: {
  readonly file: File;
  readonly readFile: (file: File) => Promise<string>;
  readonly now: () => number;
  readonly isMounted: () => boolean;
  readonly cutsheetStore: EpisodeCutsheetStore;
  readonly stripDirector: StripDirectorSession;
}): Promise<CutsheetLoadOutcome> {
  const { file, readFile, now, isMounted, cutsheetStore, stripDirector } = params;
  let text: string;
  try {
    text = await readFile(file);
  } catch (error) {
    return {
      ok: false,
      failure: failVisible("cutsheet-file-read", `${file.name}: 큐시트 파일을 읽을 수 없습니다.`, error, now()),
    };
  }
  const parsed = parseEpisodeCutsheet(text, now());
  if (!parsed.ok) {
    return { ok: false, failure: parsed.failure };
  }
  if (!isMounted()) {
    return {
      ok: true,
      receipt: { kind: "cutsheet", fileName: file.name, mime: CUTSHEET_MIME, bytes: text.length, durationMs: 0 },
      noticeKo: "",
    };
  }
  cutsheetStore.replaceDocument(parsed.document);
  const firstBeat = parsed.document.beats[0];
  if (firstBeat) {
    const snap = firstBeat.snapshot;
    const validPreset = snap.activeDirectorId ? findWebtoonSceneDirectorPreset(snap.activeDirectorId) : null;
    stripDirector.update({
      activeDirectorId: (validPreset ? validPreset.id : "") as WebtoonSceneDirectorPresetId | "",
      locale: snap.locale,
      jaWritingMode: snap.jaWritingMode,
      tankobonOrder: snap.tankobonOrder,
      manuscriptMood: snap.manuscriptMood,
      gutterPaces: snap.gutterPaces,
      screentones: snap.screentones,
      actingArc: snap.actingArc,
      bakeStripFx: snap.bakeStripFx,
      stripFxLines: snap.stripFxLines,
      dialogueLines: snap.dialogueLines,
      bubbleShapes: snap.bubbleShapes,
      bubbleFontScales: snap.bubbleFontScales,
      sfxStamps: snap.sfxStamps,
      speakerTargets: snap.speakerTargets,
      cutCameraPresets: snap.cutCameraPresets,
      partnerSide: snap.partnerSide,
      includePsdMangaFx: snap.includePsdMangaFx,
    });
  }
  return {
    ok: true,
    receipt: {
      kind: "cutsheet",
      fileName: file.name,
      mime: CUTSHEET_MIME,
      bytes: text.length,
      durationMs: 0,
    },
    noticeKo: `'${parsed.document.episodeTitleKo}' 큐시트(${parsed.document.beats.length}비트 · ${parsed.document.beats.length * 4}컷)를 불러와 첫 번째 씬 비트를 적용했습니다.`,
  };
}
