import { useExampleNotification } from "./use-example-notification";

export interface BrowserOutput { readonly kind: "copy"; readonly text: string; }

/** 클립보드가 응답한 뒤에만 복사 완료로 처리한다. 원고 저장을 실행하지 않는다. */
export function useBrowserOutput() {
  return useExampleNotification<BrowserOutput>((task) => {
    if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("이 환경에서는 클립보드 복사를 지원하지 않습니다.");
    return navigator.clipboard.writeText(task.text);
  });
}
