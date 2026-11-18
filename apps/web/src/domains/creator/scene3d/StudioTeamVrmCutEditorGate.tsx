import { cloneElement, useEffect, useState, type ReactElement } from "react";

import type { StudioBackground3DProps } from "../bg3d/StudioBackground3DTypes";
import { readTeamVrmCut, readTeamVrmCutReceipt, TeamVrmCutAccessError, type TeamCutScope } from "./studio-team-vrm-cut-client";

type Loaded = Awaited<ReturnType<typeof readTeamVrmCut>>;
const accessMessage = "작품의 원본 컷을 열 권한이 없습니다. 팀 참여 상태를 확인한 뒤 원고에서 컷을 다시 선택해 주세요.";

export default function StudioTeamVrmCutEditorGate({ editor, workId, pageId, anchorId, authorized }:
  TeamCutScope & { authorized: boolean; editor: ReactElement<StudioBackground3DProps> }) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setLoaded(undefined);
    setError(undefined);
    if (!authorized) return;
    const controller = new AbortController();
    readTeamVrmCut({ workId, pageId, anchorId }, controller.signal).then(result => {
      if (!controller.signal.aborted) setLoaded(result);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : accessMessage);
    });
    return () => controller.abort();
  }, [workId, pageId, anchorId, authorized, retry]);

  useEffect(() => {
    if (!loaded || !authorized) return;
    let controller: AbortController | undefined;
    async function recheck() {
      if (document.hidden || !loaded) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const receipt = await readTeamVrmCutReceipt({ workId, pageId, anchorId }, request.signal);
        if (!request.signal.aborted && receipt.sceneSha256 !== loaded.sceneSha256)
          throw new TeamVrmCutAccessError("열려 있는 컷과 저장된 원본이 다릅니다. 원고에서 컷을 다시 선택해 주세요.");
        if (!request.signal.aborted) setError(undefined);
      } catch (cause) {
        if (request.signal.aborted) return;
        if (cause instanceof TeamVrmCutAccessError) setLoaded(undefined);
        setError(cause instanceof Error ? cause.message : "연결을 확인하고 다시 시도해 주세요.");
      }
    }
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("online", recheck);
    return () => {
      controller?.abort();
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("online", recheck);
    };
  }, [loaded, workId, pageId, anchorId, authorized]);

  if (authorized && loaded) return <>
    {cloneElement(editor, { initialScene: loaded.scene, cutWorkResources: loaded.resources })}
    {error && <p role="alert" className="fixed inset-x-4 bottom-4 z-[65] mx-auto max-w-lg rounded-lg border border-line bg-panel p-3 text-fg">{error}</p>}
  </>;
  const message = authorized ? error : accessMessage;
  return <section role="dialog" aria-modal="true" aria-label="작품 VRM 컷 열기" className="fixed inset-0 z-50 grid place-items-center bg-panel/80">
    <div className="max-w-sm rounded-xl border border-line bg-panel p-5 text-fg shadow-xl">
      <p role={message ? "alert" : "status"}>{message ?? "작품의 VRM 모델과 채색을 확인하는 중입니다."}</p>
      <div className="mt-4 flex gap-2"><button type="button" className="min-h-11 rounded border border-line px-3" onClick={editor.props.onClose}>원고로 돌아가기</button>
        {authorized && error && <button type="button" className="min-h-11 rounded bg-accent px-3 text-on-accent" onClick={() => setRetry(n => n + 1)}>다시 받기</button>}</div>
    </div>
  </section>;
}
