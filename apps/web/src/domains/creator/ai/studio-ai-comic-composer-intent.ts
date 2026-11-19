import type { StudioAiComicComposerHandoff } from "./studio-ai-comic-composer-handoff";

import { toast } from "@/shared/lib/toast-store";

export const STUDIO_AI_COMIC_COMPOSER_OPEN_EVENT =
  "toonspectrum:studio-ai-comic-composer-open";

export interface StudioAiComicComposerIntentTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  dispatchEvent(event: Event): boolean;
}

let pendingHandoff: StudioAiComicComposerHandoff | null = null;

function browserTarget(): StudioAiComicComposerIntentTarget | null {
  return typeof window === "undefined" ? null : window;
}

export function requestStudioAiComicComposerOpen(
  handoff: StudioAiComicComposerHandoff,
  target: StudioAiComicComposerIntentTarget | null = browserTarget(),
): void {
  pendingHandoff = handoff;
  if (!target || typeof Event === "undefined") return;
  target.dispatchEvent(new Event(STUDIO_AI_COMIC_COMPOSER_OPEN_EVENT));
}

export function consumeStudioAiComicComposerOpenRequest(): StudioAiComicComposerHandoff | null {
  const handoff = pendingHandoff;
  pendingHandoff = null;
  return handoff;
}

export function subscribeStudioAiComicComposerOpenRequest(
  listener: (handoff: StudioAiComicComposerHandoff) => void,
  target: StudioAiComicComposerIntentTarget | null = browserTarget(),
): () => void {
  if (!target) return () => {};
  const deliver = () => {
    const handoff = consumeStudioAiComicComposerOpenRequest();
    if (handoff) listener(handoff);
  };
  const handleOpen: EventListener = () => deliver();
  target.addEventListener(STUDIO_AI_COMIC_COMPOSER_OPEN_EVENT, handleOpen);
  deliver();
  let active = true;
  let unsubscribe: (() => void) | undefined;
  if (target === browserTarget() && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("directorReturn")) {
    void import("./studio-director-editor-return").then(({ restoreDirectorEditorReturn }) => {
      if (active) unsubscribe = restoreDirectorEditorReturn(listener);
    }).catch(() => {
      if (active) toast("콘티를 열지 못했습니다. 새로고침해 다시 열어 주세요.", { tone: "error" });
    });
  }
  return () => {
    active = false;
    unsubscribe?.();
    target.removeEventListener(STUDIO_AI_COMIC_COMPOSER_OPEN_EVENT, handleOpen);
  };
}
