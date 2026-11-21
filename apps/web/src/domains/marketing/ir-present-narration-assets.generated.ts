/** scripts/prepare-ir-present-narration.mts가 검증한 음원을 설치할 때 갱신한다. */
export const IR_NARRATION_ASSETS: {
  status: "unverified" | "verified";
  contentRevision: string | null;
  sourceSha256: string | null;
  scriptSha256: string | null;
  clips: { audio: string; sha256: string; duration: number }[];
} = {
  status: "unverified",
  contentRevision: null,
  sourceSha256: null,
  scriptSha256: null,
  clips: [],
};
