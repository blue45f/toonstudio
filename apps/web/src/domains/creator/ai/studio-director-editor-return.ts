import { z } from "zod";

import { parseStudioWorkspaceRoute } from "../studio-workspace-route";

import { readDirectorDeviceDraft } from "./studio-director-device-draft";
import { createStudioToonProductionHandoff } from "./studio-toon-production-board";

import type { StudioAiComicComposerHandoff } from "./studio-ai-comic-composer-handoff";
import type { StudioAiComicDirectorSessionDocument } from "./studio-ai-comic-director-session";
import type { StudioScenarioImageGenerationRequest } from "./studio-scenario-candidate-workflow";

import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";
import { useApp } from "@/shared/lib/store";
import { toast } from "@/shared/lib/toast-store";

const RECEIPT_KEY = "toonspectrum:director-editor-return:v1";
const QUERY = "directorReturn";
const Receipt = z.object({
  token: z.string().min(1),
  pathname: z.string().min(1),
  sessionId: z.string().min(1),
  actorId: z.string().nullable(),
  workId: z.string().nullable(),
  remixSourceWorkId: z.string().nullable(),
  revision: z.number().int().positive(),
  updatedAt: z.string(),
  request: z.object({
    indexes: z.array(z.number().int().nonnegative()).optional(),
    variants: z.union([z.literal(1), z.literal(2), z.literal(4)]).optional(),
    qualityProfile: z.enum(["draft", "balanced", "final"]).optional(),
    variationStrategy: z.enum(["subtle", "directorial", "coverage"]).optional(),
  }).strict().optional(),
}).strict();

type Scope = Pick<StudioAiComicDirectorSessionDocument, "workId" | "remixSourceWorkId">;
function matchesCanvas(url: URL, scope: Scope) {
  const route = parseStudioWorkspaceRoute(url);
  return url.origin === window.location.origin && route.valid && route.presentation === "editor"
    && route.surface === "canvas" && route.workId === scope.workId && route.remixSourceWorkId === scope.remixSourceWorkId;
}

/** 같은 탭의 저장된 콘티를 가리킨다. 대본·이미지·키는 전달 표식에 복사하지 않는다. */
export function prepareDirectorEditorReturn(session: StudioAiComicDirectorSessionDocument, href: string, request?: StudioScenarioImageGenerationRequest): string | null {
  try {
    const url = new URL(href, window.location.origin);
    if (!matchesCanvas(url, session)) return null;
    const actorId = useApp.getState().userId;
    if ((session.workId || session.remixSourceWorkId) && !actorId) return null;
    const token = createSecureRandomUuid();
    const receipt = Receipt.parse({
      token, actorId, pathname: url.pathname, sessionId: session.id,
      workId: session.workId, remixSourceWorkId: session.remixSourceWorkId, revision: session.revision,
      updatedAt: session.updatedAt, request,
    });
    window.sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
    url.searchParams.set(QUERY, token);
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

function readReceipt() {
  try {
    const raw = window.sessionStorage.getItem(RECEIPT_KEY);
    return raw ? Receipt.parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function restoreDirectorEditorReturn(listener: (handoff: StudioAiComicComposerHandoff) => void): () => void {
  const receipt = readReceipt();
  if (!receipt || ((receipt.workId || receipt.remixSourceWorkId) && !receipt.actorId)) return () => {};
  let disposed = false;
  let pending = false;
  function activeUrl() {
    const url = new URL(window.location.href);
    return receipt && !disposed && url.searchParams.get(QUERY) === receipt.token && url.pathname === receipt.pathname
      && matchesCanvas(url, receipt) && readReceipt()?.token === receipt.token ? url : null;
  }
  const consume = (url: URL) => {
    window.sessionStorage.removeItem(RECEIPT_KEY);
    url.searchParams.delete(QUERY);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    unsubscribe();
  };
  const deliver = async () => {
    const url = activeUrl();
    if (!url) return;
    const actor = useApp.getState().userId;
    if (actor === null && receipt.actorId !== null) return;
    if (actor !== receipt.actorId) { consume(url); return; }
    if (pending) return;
    pending = true;
    try {
      const { session: saved } = await readDirectorDeviceDraft(receipt.sessionId);
      const current = activeUrl();
      if (!current) return;
      const currentActor = useApp.getState().userId;
      if (currentActor === null && receipt.actorId !== null) { pending = false; return; }
      consume(current);
      if (currentActor !== actor) return;
      if (saved?.id === receipt.sessionId && saved.workId === receipt.workId && saved.remixSourceWorkId === receipt.remixSourceWorkId
        && saved.revision === receipt.revision && saved.updatedAt === receipt.updatedAt) {
        listener(createStudioToonProductionHandoff({
          title: saved.title, storyText: saved.storyText, characterDescription: saved.characterDescription, scenes: saved.scenes,
          request: receipt.request,
        }));
        return;
      }
    } catch { if (!activeUrl()) return; }
    toast("콘티를 다시 확인해 주세요. 뒤로 돌아가 최신 콘티에서 제작을 이어갈 수 있어요.", { tone: "error" });
  };
  const unsubscribe = useApp.subscribe(() => { void deliver(); });
  void deliver();
  return () => { disposed = true; unsubscribe(); };
}
