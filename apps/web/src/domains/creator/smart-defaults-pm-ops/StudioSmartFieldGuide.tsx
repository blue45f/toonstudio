/**
 * 공용 제로-프릭션 입력 가드 컴포넌트 (`StudioSmartFieldGuide`).
 *
 * 어떤 입력칸·선택 박스 옆에도 바로 붙여 사용할 수 있으며,
 * ① '왜 이 항목이 중요한지' 1줄 의도 설명(`intentHint`)
 * ② 현재 추천 근거(`recommendedWhy`)와 AI/스마트 자동 제안 배지
 * ③ 3종 대안 프리셋 원클릭 전환 + 빈칸 발생 시 즉시 추천값 1클릭 채움 가드를 제공한다.
 */

import { RotateCcw, Sparkles, Wand2 } from "lucide-react";
import type { ReactNode } from "react";

import {
  SMART_DEFAULT_SPRITE_PATHS,
  type SmartFieldDefaultSpec,
} from "./smart-defaults-intent-engine";

import "./smart-defaults-pm-ops.css";

export interface StudioSmartFieldGuideProps {
  readonly field: SmartFieldDefaultSpec;
  readonly onChange: (nextValue: string) => void;
  readonly onRestoreRecommended?: () => void;
  /** 외부 커스텀 입력 컨트롤을 직접 감싸고 싶을 때 전달한다(생략 시 내장 입력 컨트롤 렌더링). */
  readonly children?: ReactNode;
  readonly testIdPrefix?: string;
}

export function StudioSmartFieldGuide({
  field,
  onChange,
  onRestoreRecommended,
  children,
  testIdPrefix = "smart-field",
}: StudioSmartFieldGuideProps) {
  const isEmpty = field.value.trim().length === 0;
  const inputId = `${testIdPrefix}-${field.fieldId}-input`;
  const intentId = `${testIdPrefix}-${field.fieldId}-intent`;

  const selectOptions = Array.from(
    new Set([
      field.recommendedValue,
      field.value,
      ...field.alternatives.map((alt) => alt.value),
    ].filter((item) => item.trim().length > 0)),
  );

  const handleRestore = () => {
    if (onRestoreRecommended) {
      onRestoreRecommended();
      return;
    }
    onChange(field.recommendedValue);
  };

  return (
    <div
      className="ts-smart-field"
      data-empty={isEmpty ? "true" : "false"}
      data-testid={`${testIdPrefix}-${field.fieldId}`}
    >
      <div className="ts-smart-field__top">
        <label htmlFor={inputId} className="ts-smart-field__label">
          {field.labelKo}
          {field.unitKo ? <span className="ts-pm-num"> ({field.unitKo})</span> : null}
        </label>
        <span className="ts-pm-pill" data-tone="accent">
          <img
            src={SMART_DEFAULT_SPRITE_PATHS.aiCompass}
            alt=""
            aria-hidden="true"
            className="ts-pm-sprite-sm"
            width={20}
            height={20}
          />
          {field.aiSuggestionBadgeKo}
        </span>
      </div>

      <p id={intentId} className="ts-smart-field__intent">
        <strong>왜 중요한가요?</strong> {field.intentHint}
      </p>

      <div className="ts-smart-field__control-row">
        <div className="ts-smart-field__control-wrap">
          {children ? (
            children
          ) : field.controlType === "select" ? (
            <select
              id={inputId}
              aria-describedby={intentId}
              aria-label={field.labelKo}
              className="ts-pm-select"
              value={field.value}
              onChange={(event) => onChange(event.target.value)}
            >
              {selectOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : field.controlType === "textarea" ? (
            <textarea
              id={inputId}
              aria-describedby={intentId}
              aria-label={field.labelKo}
              className="ts-pm-textarea"
              value={field.value}
              onChange={(event) => onChange(event.target.value)}
            />
          ) : (
            <input
              id={inputId}
              type={field.controlType === "number" ? "number" : "text"}
              aria-describedby={intentId}
              aria-label={field.labelKo}
              className="ts-pm-input"
              value={field.value}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </div>

        <button
          type="button"
          className="ts-pm-btn"
          onClick={handleRestore}
          data-testid={`${testIdPrefix}-${field.fieldId}-fill-recommended`}
        >
          <RotateCcw size={15} aria-hidden="true" />
          추천값 채움
        </button>
      </div>

      {isEmpty ? (
        <div className="ts-smart-field__guard" role="alert">
          <span>빈칸 감지 — 아래 버튼 한 번으로 검증된 추천 기본값을 바로 채울 수 있습니다.</span>
          <button
            type="button"
            className="ts-pm-btn"
            data-variant="primary"
            onClick={handleRestore}
          >
            <Wand2 size={15} aria-hidden="true" />
            빈칸 자동 채움
          </button>
        </div>
      ) : null}

      <p className="ts-smart-field__why">
        <Sparkles size={13} aria-hidden="true" /> <strong>추천 근거:</strong> {field.recommendedWhy}
      </p>

      <div
        className="ts-smart-field__alts"
        role="group"
        aria-label={`${field.labelKo} 3종 대안 프리셋`}
      >
        {field.alternatives.map((alt) => {
          const active = field.value === alt.value;
          return (
            <button
              key={alt.id}
              type="button"
              className="ts-pm-chip-btn"
              aria-pressed={active}
              title={alt.whyKo}
              onClick={() => onChange(alt.value)}
            >
              {alt.labelKo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default StudioSmartFieldGuide;
