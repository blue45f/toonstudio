/**
 * 열린 Claude 보조 대화상자 하나를 그린다(`AiAssistDialogHostEntry`가 지연 로드). 대화상자는 처음 열 때만 내려받는다.
 */
import { Suspense } from "react";

import { closeAiAssistFeature, type AiAssistFeatureId } from "./ai-assist-dialog-store";
import { AI_ASSIST_FEATURES } from "./ai-assist-features";

export function AiAssistDialogHost({ featureId }: { readonly featureId: AiAssistFeatureId }) {
  const feature = AI_ASSIST_FEATURES.find((item) => item.id === featureId);
  if (!feature) return null;
  return (
    <Suspense fallback={null}>
      <feature.Dialog onClose={closeAiAssistFeature} />
    </Suspense>
  );
}
