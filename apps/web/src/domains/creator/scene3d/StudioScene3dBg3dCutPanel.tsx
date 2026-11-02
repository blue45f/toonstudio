"use no memo";

import { useEffect, useReducer } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioScene3dCutPanel } from "./StudioScene3dCutPanel";
import { StudioScene3dCutSession } from "./studio-scene3d-cut-session";
import {
  createStudioScene3dCutBg3dHost,
  isStudioScene3dCutBg3dHost,
  studioScene3dCutProjectId,
  type StudioScene3dCutBg3dEditorHost,
} from "./studio-scene3d-cut-bg3d-host";
import { getStudioWebAuthoringProjectV3Repository } from "../studio-web-runtime/studio-web-authoring-project-v3-repository";

const sessions = new WeakMap<
  object,
  {
    id: string;
    generation: number;
    assetSession: unknown;
    modelRenderer: StudioScene3dCutBg3dEditorHost["modelRenderer"];
    materialBackend: StudioScene3dCutBg3dEditorHost["materialBackend"];
    isMaterialBackendCurrent: StudioScene3dCutBg3dEditorHost["isMaterialBackendCurrent"];
    session: StudioScene3dCutSession;
  }
>();
/** 기존 가변 host bag을 그대로 사용하여 간편/전문가 모드가 같은 컷 세션을 공유한다. */
export function StudioScene3dBg3dCutPanel({
  host,
  preferredExpanded,
}: {
  readonly host: unknown;
  readonly preferredExpanded?: boolean;
}) {
  const t = useBilingual("scene3d-cut-versions");
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const timer = setInterval(refresh, 300);
    return () => clearInterval(timer);
  }, []);
  if (!isStudioScene3dCutBg3dHost(host)) return null;
  const waitingPanel = (
    <p role="status" className="p-3 text-xs text-fg-2">
      {t(
        "장면과 렌더러가 준비되면 컷 패널을 엽니다.",
        "The cut panel opens when the scene and renderer are ready."
      )}
    </p>
  );
  const id = studioScene3dCutProjectId(host);
  let cached = sessions.get(host);
  const sameScope = cached?.id === id && cached?.assetSession === host.modalAssetSessionRef?.current;
  const engineChanged = cached && (
    cached.modelRenderer !== host.modelRenderer ||
    cached.materialBackend !== host.materialBackend ||
    cached.isMaterialBackendCurrent !== host.isMaterialBackendCurrent
  );
  const hostPreparing = host.isRestoringScene || host.modelRenderer == null || host.isMaterialBackendCurrent?.() === false;
  if (
    !cached ||
    cached.id !== id ||
    cached.assetSession !== host.modalAssetSessionRef?.current ||
    (engineChanged && cached.session.canRestartForHostChange())
  ) {
    if (hostPreparing) {
      if (!cached || !sameScope) return waitingPanel;
    } else {
      cached?.session.dispose();
      cached = {
        id,
        // 같은 문서의 엔진 교체는 패널의 미제출 이름·JSON 입력을 유지한다.
        generation: sameScope && cached ? cached.generation : (cached?.generation ?? 0) + 1,
        assetSession: host.modalAssetSessionRef?.current,
        modelRenderer: host.modelRenderer,
        materialBackend: host.materialBackend,
        isMaterialBackendCurrent: host.isMaterialBackendCurrent,
        session: new StudioScene3dCutSession(
          createStudioScene3dCutBg3dHost(host),
          getStudioWebAuthoringProjectV3Repository()
        ),
      };
      sessions.set(host, cached);
    }
  }
  return (
    <StudioScene3dCutPanel
      key={`${id}:${cached.generation}`}
      session={cached.session}
      preferredExpanded={preferredExpanded}
      hostPreparing={hostPreparing}
    />
  );
}
