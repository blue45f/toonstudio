import { useEffect, useRef, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";

import {
  createDictationSession,
  insertDictationText,
  DICTATION_UNSUPPORTED_MESSAGE,
  type DictationSession,
  type DictationSnapshot,
} from "./studio-speech-dictation";

interface StudioDictationMicButtonProps {
  /** 현재 본문과 선택 범위를 읽는 getter — 호스트(textarea 상태 소유자)가 제공한다. */
  getTarget: () => { value: string; selectionStart: number; selectionEnd: number } | null;
  /** 삽입된 새 본문을 호스트에 반영한다(오버레이: setValue+applyLiveValue, 모달: setValue). */
  applyValue: (value: string, caret: number) => void;
  disabled?: boolean;
}

/**
 * 말풍선 대사 입력용 음성 받아쓰기 버튼 — 식자 패널/텍스트 편집 표면에 붙는 부품.
 *
 * 확정 전사가 누적될 때마다 "이미 삽입한 길이" 이후 부분만 커서 위치에 이어 붙이므로,
 * 연속 발화로 여러 문장을 말해도 중복 삽입이 없다. 중간 전사는 버튼 아래 미리보기로만
 * 보이고 본문에는 닿지 않는다. 미지원 브라우저에서는 버튼 대신 폴백 안내를 렌더한다
 * (버튼을 눌러도 아무 일 없는 상태가 최악의 마찰이라, 처음부터 이유와 대안을 보인다).
 */
export default function StudioDictationMicButton({ getTarget, applyValue, disabled }: StudioDictationMicButtonProps) {
  const [snapshot, setSnapshot] = useState<DictationSnapshot | null>(null);
  const sessionRef = useRef<DictationSession | null>(null);
  const insertedLengthRef = useRef(0);
  const getTargetRef = useRef(getTarget);
  getTargetRef.current = getTarget;
  const applyValueRef = useRef(applyValue);
  applyValueRef.current = applyValue;

  useEffect(() => {
    const session = createDictationSession({
      onSnapshot: setSnapshot,
      onFinalText: (finalText) => {
        const fresh = finalText.slice(insertedLengthRef.current).trim();
        if (!fresh) return;
        const target = getTargetRef.current();
        if (!target) return;
        const next = insertDictationText(target.value, target.selectionStart, target.selectionEnd, fresh);
        insertedLengthRef.current = finalText.length;
        applyValueRef.current(next.value, next.caret);
      },
    });
    sessionRef.current = session;
    setSnapshot(session.snapshot());
    return () => {
      session.dispose();
      sessionRef.current = null;
    };
  }, []);

  if (!snapshot) return null;

  if (snapshot.status === "unsupported") {
    return (
      <p role="note" className="text-xs leading-relaxed text-fg-3">
        {DICTATION_UNSUPPORTED_MESSAGE}
      </p>
    );
  }

  const listening = snapshot.status === "listening" || snapshot.status === "requesting" || snapshot.status === "stopping";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || snapshot.status === "stopping"}
          aria-pressed={listening}
          aria-label={listening ? "받아쓰기 중지" : "음성으로 대사 입력"}
          onClick={() => {
            const session = sessionRef.current;
            if (!session) return;
            if (listening) {
              session.stop();
            } else {
              insertedLengthRef.current = 0;
              session.start();
            }
          }}
          className={buttonClass({ size: "sm", variant: listening ? "solid" : "quiet" })}
        >
          <span aria-hidden="true">{listening ? "■" : "🎙"}</span>
          {snapshot.status === "requesting"
            ? "마이크 켜는 중…"
            : snapshot.status === "stopping"
              ? "마무리 중…"
              : listening
                ? "듣고 있어요 — 눌러서 중지"
                : "말로 입력"}
        </button>
        {snapshot.status === "done" ? (
          <span role="status" className="text-xs text-fg-3">
            대사에 넣었어요
          </span>
        ) : null}
      </div>
      {listening && snapshot.interimText ? (
        <p aria-live="polite" className="text-xs italic text-fg-3">
          {snapshot.interimText}…
        </p>
      ) : null}
      {snapshot.status === "error" && snapshot.error ? (
        <p role="alert" className="text-xs leading-relaxed text-warn">
          {snapshot.error.message}
          {snapshot.error.recoverable ? " 다시 눌러 재시도할 수 있어요." : ""}
        </p>
      ) : null}
    </div>
  );
}
