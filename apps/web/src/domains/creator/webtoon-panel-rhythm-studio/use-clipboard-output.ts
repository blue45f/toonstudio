import { useExampleNotification } from "./use-example-notification";

/** 클립보드 응답만 확인하며 원고 저장이나 예제 수신자 알림은 실행하지 않는다. */
export function useClipboardOutput(): ReturnType<typeof useExampleNotification<string>> {
  return useExampleNotification<string>(function copy(text): Promise<void> {
    if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("클립보드 복사를 지원하지 않습니다.");
    return navigator.clipboard.writeText(text);
  });
}
