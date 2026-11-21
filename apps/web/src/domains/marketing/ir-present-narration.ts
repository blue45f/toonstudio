/** 화면 문안이 바뀌면 revision을 갱신하고 내레이션 일치를 다시 확인한다. */
export const IR_PRESENT_CONTENT_REVISION = "mentor-review-2026-11-21";

export interface IrNarrationVerification {
  status: "unverified" | "verified";
  contentRevision: string | null;
}

/** 기존 MP3는 보존하되 현재 화면 문안과의 일치가 확인되기 전에는 재생하지 않는다. */
export const IR_NARRATION_VERIFICATION: IrNarrationVerification = {
  status: "unverified",
  contentRevision: null,
};

export function isIrNarrationCurrent(
  verification: IrNarrationVerification = IR_NARRATION_VERIFICATION,
  contentRevision: string = IR_PRESENT_CONTENT_REVISION,
): boolean {
  return verification.status === "verified"
    && contentRevision.length > 0
    && verification.contentRevision === contentRevision;
}
