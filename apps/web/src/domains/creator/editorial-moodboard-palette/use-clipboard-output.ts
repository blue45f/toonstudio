import { useExampleNotification } from "./use-example-notification";

export function useClipboardOutput(): ReturnType<typeof useExampleNotification<string>> {
  return useExampleNotification<string>(function copy(text): Promise<void> {
    if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("클립보드 복사를 지원하지 않습니다.");
    return navigator.clipboard.writeText(text);
  });
}
