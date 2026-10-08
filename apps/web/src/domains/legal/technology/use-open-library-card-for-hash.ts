import { useEffect } from "react";

/**
 * 주소의 `#library-<카드 id>` 앵커로 들어오면 그 라이브러리 카드를 펼치고 화면 맨 위로 맞춘다.
 * (영역 앵커 `#brush-engines` 같은 것은 카드를 펼치지 않는다.) 잘못 인코딩된 주소(`#%E0`)에서도 예외 없이 지나간다.
 * 컴포넌트 파일에서 훅을 내보내면 Fast Refresh 규칙에 걸리므로 별도 파일에 둔다.
 */
function hashTargetId(hash: string): string {
  const raw = hash.slice(1);
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function useOpenLibraryCardForHash(bodyId: string): void {
  useEffect(() => {
    const openTarget = (): void => {
      const id = hashTargetId(window.location.hash);
      if (!id.startsWith("library-")) return;
      const target = document.getElementById(id);
      const body = document.getElementById(bodyId);
      if (!target || !body?.contains(target)) return;
      const details = target.querySelector<HTMLDetailsElement>("details[data-eng-disclosure]");
      if (!details) return;
      const wasClosed = !details.open;
      details.open = true;
      if (wasClosed) target.scrollIntoView({ block: "start" });
    };
    openTarget();
    window.addEventListener("hashchange", openTarget);
    return () => window.removeEventListener("hashchange", openTarget);
  }, [bodyId]);
}
