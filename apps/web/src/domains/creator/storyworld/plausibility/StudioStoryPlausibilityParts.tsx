/**
 * 개연성 점검 허브의 작은 공용 부품: 배지, 점검표.
 */
import { AlertTriangle, CircleHelp, XCircle } from "lucide-react";

import {
  PLAUSIBILITY_CATEGORIES,
  PLAUSIBILITY_CONFIDENCE_LABELS,
  PLAUSIBILITY_SEVERITY_LABELS,
  type PlausibilityConfidence,
  type PlausibilitySeverity,
} from "./studio-story-plausibility-types";

const SEVERITY_ICONS = { error: XCircle, warning: AlertTriangle, suggestion: CircleHelp } as const;

/** 색만으로 뜻을 전하지 않도록 아이콘과 글자를 함께 쓴다. */
export function SeverityBadge({ severity }: { readonly severity: PlausibilitySeverity }) {
  const Icon = SEVERITY_ICONS[severity];
  return (
    <span className={`plausibility-badge plausibility-badge--${severity}`}>
      <Icon aria-hidden size={13} />
      {PLAUSIBILITY_SEVERITY_LABELS[severity]}
    </span>
  );
}

const CONFIDENCE_EXPLANATIONS: Readonly<Record<PlausibilityConfidence, string>> = {
  certain: "입력한 내용만으로 어긋남이 확인돼요",
  heuristic: "글쓰기 관습에 기댄 추정이라 틀릴 수 있어요",
};

export function ConfidenceBadge({ confidence }: { readonly confidence: PlausibilityConfidence }) {
  return (
    <span className="plausibility-badge plausibility-badge--muted">
      {PLAUSIBILITY_CONFIDENCE_LABELS[confidence]}
      <span className="sr-only"> — {CONFIDENCE_EXPLANATIONS[confidence]}</span>
    </span>
  );
}

/**
 * 초보 작가용 점검표: 허브가 묻는 아홉 가지를 범주별 질문으로 보여 준다.
 * 같은 내용을 글로 읽는 안내는 docs/learn/story-plausibility-checklist.md 에 있다.
 */
export function CategoryGuide() {
  return (
    <details className="plausibility-details">
      <summary>점검표 보기 — 이 허브가 묻는 아홉 가지</summary>
      <ul aria-label="개연성 점검표" className="plausibility-sources">
        {PLAUSIBILITY_CATEGORIES.map((category) => (
          <li key={category.id}>
            <strong>{category.label} · {category.question}</strong>
            <span className="plausibility-hint">{category.description}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
