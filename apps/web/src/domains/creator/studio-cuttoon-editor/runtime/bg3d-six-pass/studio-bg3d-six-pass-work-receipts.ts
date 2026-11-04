/** 실제 서버 영수증을 검증한 호출자만 기록한다. 원고 JSON의 표식은 원격 권한을 부여하지 않는다. */
const workReceipts = new Map<string, Set<string>>();
export function rememberStudioBg3dSixPassWorkReceipt(workId: string, manifestHash: string): void {
  if (!workId || !/^sha256:[a-f0-9]{64}$/u.test(manifestHash)) throw new Error("6패스 작품 영수증 범위가 올바르지 않습니다.");
  const receipts = workReceipts.get(workId) ?? new Set<string>(); receipts.add(manifestHash); workReceipts.set(workId, receipts);
}
export function studioBg3dSixPassWorkReceiptsCover(workId: string, manifestHashes: readonly string[]): boolean {
  const receipts = workReceipts.get(workId);
  return manifestHashes.length > 0 && manifestHashes.every((hash) => receipts?.has(hash) === true);
}
