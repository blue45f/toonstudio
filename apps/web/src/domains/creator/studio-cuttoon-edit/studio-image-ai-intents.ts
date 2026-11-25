import type { Dispatch, SetStateAction } from "react";

import { isStudioAiConfigured, type StudioAiSettings } from "../ai/studio-ai-client-lazy";
import { mergeContextNote } from "../ai/studio-ai-context-note";
import { saveContextNote } from "../ai/studio-ai-context-note-storage";

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
