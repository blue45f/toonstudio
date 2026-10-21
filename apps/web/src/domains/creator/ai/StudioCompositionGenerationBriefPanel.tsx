import { useMemo, useState } from "react";

import { StudioAiConnectionBadge, StudioAiConnectionNotice } from "./StudioAiConnectionBadge";
import {
  buildCompositionGenerationBrief,
  type CompositionGenerationSnapshot,
} from "./studio-composition-generation-brief";

/**
 * 3D 구도 → AI 이미지 생성 브리프 패널 (투닝 플러스 3D Studio 간판 동선 흡수).
 *
 * 포저/bg3d에서 잡은 구도를 생성 요청 패킷으로 보여준다. 제공자 실연결 전에는
 * 정직하게 그 사실을 표시하고, 브리프 복사(외부 도구·협업 전달)와
 * "캡처 그대로 삽입" 폴백만으로 동작한다 — 없는 생성을 있는 척하지 않는다.
 */
export interface StudioCompositionGenerationBriefPanelProps {
  readonly snapshot: CompositionGenerationSnapshot | null;
  /** AI 제공자가 연결돼 있으면 주입. 없으면 브리프/폴백 모드. */
  readonly onRequestGeneration?: () => void;
  /** 폴백: 현재 구도 캡처를 컷에 그대로 삽입. */
  readonly onInsertCaptureFallback: () => void;
  readonly locale?: "ko" | "en";
}

const COPY = Object.freeze({
  ko: Object.freeze({
    title: "이 구도로 AI 이미지 만들기",
    empty: "먼저 포저나 3D 배경에서 캐릭터와 카메라를 잡아 주세요.",
    providerPending:
      "AI 생성 연결은 준비 중이에요. 지금은 아래 브리프를 복사해 쓰거나, 캡처를 그대로 넣을 수 있어요.",
    copyBrief: "브리프 복사",
    copied: "복사했어요",
    insertCapture: "캡처 그대로 넣기",
    requestGeneration: "이 구도로 생성하기",
    consistency: "일관성 키",
    errorCharacter: "캐릭터가 정해지지 않았어요.",
    errorCamera: "카메라 구도가 없어요.",
    errorFov: "화각 값이 올바르지 않아요.",
  }),
  en: Object.freeze({
    title: "Generate an AI image from this composition",
    empty: "Set a character and camera in the poser or 3D background first.",
    providerPending:
      "AI generation is not connected yet. Copy the brief below, or insert the capture as-is.",
    copyBrief: "Copy brief",
    copied: "Copied",
    insertCapture: "Insert capture as-is",
    requestGeneration: "Generate from this composition",
    consistency: "Consistency keys",
    errorCharacter: "No character is set.",
    errorCamera: "No camera composition.",
    errorFov: "Invalid field of view.",
  }),
});

export function StudioCompositionGenerationBriefPanel(
  props: StudioCompositionGenerationBriefPanelProps,
) {
  const copy = COPY[props.locale ?? "ko"];
  const [copied, setCopied] = useState(false);

  const result = useMemo(
    () => (props.snapshot ? buildCompositionGenerationBrief(props.snapshot) : null),
    [props.snapshot],
  );

  if (!props.snapshot || result === null) {
    return (
      <section aria-label={copy.title} data-testid="composition-brief-panel">
        <h3>{copy.title}</h3>
        <StudioAiConnectionBadge kind="not-connected" />
        <p data-testid="composition-brief-empty">{copy.empty}</p>
      </section>
    );
  }

  if (!result.ok) {
    const errorCopy = {
      "missing-character": copy.errorCharacter,
      "missing-camera": copy.errorCamera,
      "invalid-fov": copy.errorFov,
    } as const;
    return (
      <section aria-label={copy.title} data-testid="composition-brief-panel">
        <h3>{copy.title}</h3>
        <StudioAiConnectionBadge kind="not-connected" />
        <ul data-testid="composition-brief-errors">
          {result.errors.map((error) => (
            <li key={error}>{errorCopy[error]}</li>
          ))}
        </ul>
        <button type="button" onClick={props.onInsertCaptureFallback}>
          {copy.insertCapture}
        </button>
      </section>
    );
  }

  const { request } = result;
  const providerConnected = props.onRequestGeneration !== undefined;

  return (
    <section aria-label={copy.title} data-testid="composition-brief-panel">
      <h3>{copy.title}</h3>
      {providerConnected ? (
        <StudioAiConnectionBadge kind="provider-ready" />
      ) : (
        <>
          <StudioAiConnectionNotice
            kind="not-connected"
            detail="외부 AI 이미지 제공자는 연결 전입니다(E3 보류). 생성 버튼은 제공자가 주입될 때만 나타납니다."
          />
          <p data-testid="composition-brief-local-fallback">
            로컬 폴백 동작 중: 브리프 만들기는 이 기기에서 결정적으로 조립되며, 브리프 복사·캡처 그대로 넣기는 지금 바로 쓸 수 있습니다.
          </p>
        </>
      )}
      {!providerConnected ? (
        <p data-testid="composition-brief-provider-pending">{copy.providerPending}</p>
      ) : null}
      <pre data-testid="composition-brief-text">{request.briefKo}</pre>
      <p>
        <span>{copy.consistency}: </span>
        <span>{request.consistencyKeys.join(" · ")}</span>
      </p>
      <div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(request.prompt);
            setCopied(true);
          }}
          data-testid="composition-brief-copy"
        >
          {copied ? copy.copied : copy.copyBrief}
        </button>
        {providerConnected ? (
          <button type="button" onClick={props.onRequestGeneration}>
            {copy.requestGeneration}
          </button>
        ) : null}
        <button type="button" onClick={props.onInsertCaptureFallback}>
          {copy.insertCapture}
        </button>
      </div>
    </section>
  );
}
