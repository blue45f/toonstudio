import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { isEntryCodeValid, STUDIO_ENTRY_CODE_LENGTH, STUDIO_ENTRY_CODE_PANEL_ID } from "./studio-virtual-space-entry-code";

/** 서버 검증이 돌려주는 입장 거절 사유. 형식 오류와 구분해 안내한다. */
export type StudioEntryCodeRejectionReason = "not-found" | "revoked" | "expired" | "locked" | "unavailable";

export interface StudioEntryCodeEntryResult {
  readonly ok: boolean;
  readonly reason?: StudioEntryCodeRejectionReason;
  readonly retryAfterSeconds?: number;
}

export interface StudioVirtualSpaceEntryCodePanelProps {
  /**
   * 코드 검증 콜백. 서버 검증까지 마친 결과를 돌려준다.
   * `ok: false`면 사유를 패널이 안내하고 입장시키지 않는다.
   */
  readonly onEnterWithCode: (code: string) => Promise<StudioEntryCodeEntryResult | void> | StudioEntryCodeEntryResult | void;
  /** `#code=` 프래그먼트로 도착한 코드의 초기값. */
  readonly initialCode?: string | null;
}

/**
 * 게스트 입장코드 입력 패널. 6자리 코드 입력만으로 입장한다(가입 불필요).
 * 형식 검사는 즉시, 존재·만료·회수·잠금 판정은 서버 검증 콜백이 맡는다(F-B06-1).
 */
export function StudioVirtualSpaceEntryCodePanel({ onEnterWithCode, initialCode = null }: StudioVirtualSpaceEntryCodePanelProps) {
  const bt = useBilingual("StudioVirtualSpaceEntryCodePanel");
  const [code, setCode] = useState(initialCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const rejectionCopy = (result: StudioEntryCodeEntryResult): string => {
    switch (result.reason) {
      case "expired":
        return bt("만료된 코드예요. 보낸 사람에게 새 코드를 요청해 주세요.", "This code has expired. Ask the sender for a new code.");
      case "revoked":
        return bt("취소된 코드예요. 보낸 사람에게 확인해 주세요.", "This code was revoked. Please check with the sender.");
      case "locked": {
        const seconds = result.retryAfterSeconds ?? 0;
        return seconds >= 60
          ? bt(`시도가 너무 많아 잠시 잠겼어요. ${Math.ceil(seconds / 60)}분 뒤에 다시 시도해 주세요.`, `Too many attempts — this space is briefly locked. Try again in ${Math.ceil(seconds / 60)} minutes.`)
          : bt("시도가 너무 많아 잠시 잠겼어요. 잠시 후 다시 시도해 주세요.", "Too many attempts — this space is briefly locked. Please try again shortly.");
      }
      case "unavailable":
        return bt("코드를 확인하려면 연결이 필요해요. 연결 상태를 확인하고 다시 시도해 주세요.", "We couldn't verify the code. Check your connection and try again.");
      default:
        return bt("이 공간에 등록되지 않은 코드예요. 코드를 다시 확인해 주세요.", "This code isn't registered for this space. Please check the code and try again.");
    }
  };

  const handleSubmit = async () => {
    const normalized = code.trim().toUpperCase();
    if (!isEntryCodeValid(normalized)) {
      setError(
        bt(
          `입장코드는 ${STUDIO_ENTRY_CODE_LENGTH}자리 영숫자예요. 다시 확인해 주세요.`,
          `Entry codes are ${STUDIO_ENTRY_CODE_LENGTH} alphanumeric characters. Please check again.`,
        ),
      );
      return;
    }
    setError(null);
    setPending(true);
    try {
      const result = await onEnterWithCode(normalized);
      if (result && !result.ok) setError(rejectionCopy(result));
    } catch {
      setError(rejectionCopy({ ok: false, reason: "unavailable" }));
    } finally {
      setPending(false);
    }
  };

  return (
    <section id={STUDIO_ENTRY_CODE_PANEL_ID} tabIndex={-1} aria-label={bt("입장코드로 입장", "Enter with code")}>
      <h2>{bt("입장코드로 입장", "Enter with code")}</h2>
      <p><small>{bt("초대받은 6자리 코드를 입력하면 바로 입장해요. 가입이 필요 없어요.", "Enter the 6-digit code to join right away. No sign-up needed.")}</small></p>
      <label>{bt("입장코드", "Entry code")}
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={STUDIO_ENTRY_CODE_LENGTH}
          autoComplete="off"
          placeholder="ABC123"
          aria-describedby={error ? "entry-code-error" : undefined}
        />
      </label>
      <button type="button" disabled={pending} onClick={() => void handleSubmit()}>
        {pending ? bt("확인 중…", "Checking…") : bt("입장하기", "Enter")}
      </button>
      {error ? <p id="entry-code-error" role="alert">{error}</p> : null}
    </section>
  );
}
