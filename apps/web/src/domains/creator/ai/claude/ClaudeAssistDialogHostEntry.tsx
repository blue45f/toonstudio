/**
 * Claude 보조 대화상자를 그리는 호스트의 **입구**. 스튜디오 호스트가 늘 마운트해 두므로 진입 번들에 실린다 — 열린 대화상자가 있을 때만
 * 본체(기능 목록·대화상자)를 지연 로드하고, 닫혀 있으면 아무것도 그리지 않는다.
 */
import { Suspense, lazy } from "react";

import { useOpenClaudeAssistFeature } from "./claude-assist-dialog-store";

const ClaudeAssistDialogHost = lazy(() =>
  import("./ClaudeAssistDialogHost").then((module) => ({ default: module.ClaudeAssistDialogHost })),
);

export function ClaudeAssistDialogHostEntry() {
  const featureId = useOpenClaudeAssistFeature();
  if (featureId === null) return null;
  return (
    <Suspense fallback={null}>
      <ClaudeAssistDialogHost key={featureId} featureId={featureId} />
    </Suspense>
  );
}
