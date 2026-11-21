import { IR_NARRATION_ASSETS } from "./ir-present-narration-assets.generated";

/** 화면 문안이 바뀌면 revision을 갱신하고 내레이션 일치를 다시 확인한다. */
export const IR_PRESENT_CONTENT_REVISION = "mentor-review-2026-11-21";

export interface IrNarrationVerification {
  status: "unverified" | "verified";
  contentRevision: string | null;
}

/** 기존 MP3는 보존하되 현재 화면 문안과의 일치가 확인되기 전에는 재생하지 않는다. */
export const IR_NARRATION_VERIFICATION: IrNarrationVerification = {
  status: IR_NARRATION_ASSETS.status,
  contentRevision: IR_NARRATION_ASSETS.contentRevision,
};

export function isIrNarrationCurrent(
  verification: IrNarrationVerification = IR_NARRATION_VERIFICATION,
  contentRevision: string = IR_PRESENT_CONTENT_REVISION,
): boolean {
  return verification.status === "verified"
    && contentRevision.length > 0
    && verification.contentRevision === contentRevision;
}

/** 새 음원은 내용 해시를 URL에 포함해 이전 MP3 캐시와 구분한다. */
export function getIrNarrationSource(
  audio: string,
  assets: typeof IR_NARRATION_ASSETS = IR_NARRATION_ASSETS,
): string | null {
  if (!isIrNarrationCurrent(assets)) return null;
  if (!assets.sourceSha256 || !assets.scriptSha256
    || !/^[a-f0-9]{64}$/u.test(assets.sourceSha256) || !/^[a-f0-9]{64}$/u.test(assets.scriptSha256)) return null;
  const clip = assets.clips.find((item) => item.audio === audio);
  if (!clip || !/^n\d{2}\.mp3$/u.test(clip.audio) || !/^[a-f0-9]{64}$/u.test(clip.sha256)
    || !Number.isFinite(clip.duration) || clip.duration <= 0) return null;
  return `/brand/ir-present/audio/${clip.audio}?v=${clip.sha256.slice(0, 16)}`;
}
