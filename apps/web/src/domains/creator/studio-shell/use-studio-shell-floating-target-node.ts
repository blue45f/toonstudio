import { useLayoutEffect, useRef, useState } from "react";

interface StudioShellFloatingTargetNode {
  readonly node: HTMLElement | null;
  readonly forceVisible: boolean;
}

export function useStudioShellFloatingTargetNode(selector: string): StudioShellFloatingTargetNode {
  const [snapshot, setSnapshot] = useState<StudioShellFloatingTargetNode>({
    node: null,
    forceVisible: false,
  });
  const requested = useRef(snapshot);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return undefined;
    let active = true;
    const locate = (): void => {
      if (!active) return;
      const node = document.querySelector<HTMLElement>(selector);
      const forceVisible = node?.dataset.studioShellForceVisible === "true";
      const previous = requested.current;
      if (previous.node === node && previous.forceVisible === forceVisible) return;
      const next = { node, forceVisible };
      // React 반영 전 연속 관측도 마지막 요청과 비교해 중복 dispatch를 만들지 않는다.
      requested.current = next;
      setSnapshot(next);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-studio-shell-force-visible"],
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [selector]);

  return snapshot;
}
