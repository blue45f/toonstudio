/**
 * AI 어시스트 허브에 끼우는 Claude 보조 구역의 **입구**. 허브 번들에 실리므로 아주 가볍게 유지하고, 구역 본체(문구·카드·
 * 대화상자 목록)는 허브가 그려질 때 지연 로드한다. 구역의 실제 높이는 연결 여부와 화면 폭에 따라 달라(약 165~620px) 높이를 정확히 맞출 수는
 * 없으므로, 불러오는 동안은 자리를 알리는 최소한의 빈 틀만 둔다.
 */
import { Suspense, lazy } from "react";

import type { ClaudeAssistHubSectionProps } from "./ClaudeAssistHubSection";

const ClaudeAssistHubSection = lazy(() =>
  import("./ClaudeAssistHubSection").then((module) => ({ default: module.ClaudeAssistHubSection })),
);

export function ClaudeAssistHubEntry(props: ClaudeAssistHubSectionProps) {
  return (
    <Suspense fallback={<div aria-hidden="true" className="min-h-28 shrink-0 rounded-xl border border-line bg-panel/30" />}>
      <ClaudeAssistHubSection {...props} />
    </Suspense>
  );
}
