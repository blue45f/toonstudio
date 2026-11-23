import type { Dispatch, SetStateAction } from "react";
import { isStudioAiConfigured, type StudioAiSettings } from "../ai/studio-ai-client-lazy";
import { mergeContextNote } from "../ai/studio-ai-context-note";
import { saveContextNote } from "../ai/studio-ai-context-note-storage";
import { CANVAS_W } from "../studio-assets";
import type { El } from "../studio-element-model";
import { uid } from "../studio-id";
import { createCanvasImageElement } from "../studio-image-placement";
import type { StudioPublishAiProvenance } from "../studio-publish-preflight";

export function runStudioInsertAiBackgroundImage({
  dataUrl, width, height, aiProvenance, selected, elements, canvasH,
  patchEl, commit, setSelectedId, setTool,
}: {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly aiProvenance: StudioPublishAiProvenance;
  readonly selected: El | undefined;
  readonly elements: readonly El[];
  readonly canvasH: number;
  readonly patchEl: (id: string, patch: Partial<El>) => boolean;
  readonly commit: (next: El[]) => boolean;
  readonly setSelectedId: Dispatch<SetStateAction<string | null>>;
  readonly setTool: (tool: "select" | "draw") => void;
}): boolean {
  if (selected?.type === "frame") {
    if (!patchEl(selected.id, { bg: dataUrl, aiProvenance, bundleSourceCredit: undefined } as Partial<El>)) {
      return false;
    }
    setTool("select");
    return true;
  }
  const frames = elements.filter((e) => e.type === "frame");
  if (frames.length > 0) {
    if (!commit(elements.map((e) => (e.type === "frame" ? ({ ...e, bg: dataUrl, aiProvenance, bundleSourceCredit: undefined } as El) : e)))) {
      return false;
    }
    setTool("select");
    return true;
  }
  const el = createCanvasImageElement({
    id: uid(),
    src: dataUrl,
    canvasWidth: CANVAS_W,
    canvasHeight: canvasH,
    sourceWidth: width,
    sourceHeight: height,
    horizontalInset: 0,
    minY: 0,
  });
  if (!commit([{ ...el, aiProvenance }, ...elements])) return false;
  setSelectedId(el.id);
  setTool("select");
  return true;
}

type StudioContextNoteDoc = ReturnType<typeof mergeContextNote>;

export function runStudioContextNoteChange({
  aiContextNote, patch, setAiContextNote,
}: {
  readonly aiContextNote: StudioContextNoteDoc;
  readonly patch: Partial<Pick<StudioContextNoteDoc, "characterRules" | "palette" | "backgroundRules" | "prohibitions">>;
  readonly setAiContextNote: Dispatch<SetStateAction<StudioContextNoteDoc>>;
}): void {
  const next = mergeContextNote(aiContextNote, patch);
  setAiContextNote(next);
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      saveContextNote(globalThis.localStorage, next);
    }
  } catch {
    // 저장 실패는 편집 자체를 막지 않는다.
  }
}

export function runStudioOnGenerateAsset({
  assetPrompt, assetGenerating, studioAuthUserId, aiSettings,
  setError, runWithAiNotice, executeGenerateAsset, apiKeyRequiredMessage,
}: {
  readonly assetPrompt: string;
  readonly assetGenerating: boolean;
  readonly studioAuthUserId: string | null | undefined;
  readonly aiSettings: StudioAiSettings;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly runWithAiNotice: (action: () => void) => void;
  readonly executeGenerateAsset: (prompt: string) => Promise<void>;
  readonly apiKeyRequiredMessage: string;
}): void {
  const prompt = assetPrompt.trim();
  if (!prompt || assetGenerating) return;
  if (!studioAuthUserId) {
    setError("생성한 에셋을 라이브러리에 저장하려면 로그인이 필요해요.");
    return;
  }
  if (!isStudioAiConfigured(aiSettings)) {
    setError(apiKeyRequiredMessage);
    return;
  }
  runWithAiNotice(() => void executeGenerateAsset(prompt));
}
