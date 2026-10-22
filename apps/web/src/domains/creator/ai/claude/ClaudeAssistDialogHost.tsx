/**
 * 열린 Claude 보조 대화상자 하나를 그린다(`ClaudeAssistDialogHostEntry`가 지연 로드). 대화상자는 처음 열 때만 내려받는다.
 */
import { Suspense } from "react";

import { closeClaudeAssistFeature, type ClaudeAssistFeatureId } from "./claude-assist-dialog-store";
import { CLAUDE_ASSIST_FEATURES } from "./claude-assist-features";

export function ClaudeAssistDialogHost({ featureId }: { readonly featureId: ClaudeAssistFeatureId }) {
  const feature = CLAUDE_ASSIST_FEATURES.find((item) => item.id === featureId);
  if (!feature) return null;
  return (
    <Suspense fallback={null}>
      <feature.Dialog onClose={closeClaudeAssistFeature} />
    </Suspense>
  );
}
