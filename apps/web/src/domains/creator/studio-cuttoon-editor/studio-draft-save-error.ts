const SAVE_ERROR_PATTERN =
  /(?:초안\s*저장|서버.{0,12}저장|저장하지\s*못|저장에\s*실패|먼저\s*저장|revision|동기화\s*확인\s*후|일시적으로\s*사용할\s*수\s*없|연결이\s*끊|네트워크|서버에\s*연결할\s*수\s*없|응답이\s*지연|변경되었습니다|충돌|\b(?:409|502|503|504)\b|service\s*unavailable|conflict)/iu;
const CONFLICT_PATTERN =
  /(?:먼저\s*저장|revision|최신.{0,12}(?:불러|문서|상태)|동기화\s*확인\s*후|다른\s*곳에서\s*내용이\s*변경|충돌|\b409\b|conflict)/iu;

export function extractStudioDraftSaveError(value: unknown): string | null {
  const message = typeof value === "string"
    ? value.trim()
    : value instanceof Error
      ? value.message.trim()
      : "";
  if (!message || !SAVE_ERROR_PATTERN.test(message)) return null;
  return message.slice(0, 500);
}

export function isStudioDraftSaveConflictMessage(message: string): boolean {
  return CONFLICT_PATTERN.test(message);
}
