/**
 * VRM 프로젝트 아카이브 사용 확인 호스트의 지연 마운트 경계.
 * 실제 아카이브 확인 요청이 들어오기 전까지 vrm/* 호스트 청크를 진입 그래프에서 분리한다.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactElement } from "react";

import { registerStudioVrmArchiveAttestationLazyHostOwner } from "./studio-vrm-archive-attestation-lazy-bridge";

const LazyStudioVrmProjectArchiveAttestationHost = lazy(() =>
  import("../vrm/StudioVrmProjectArchiveAttestationHost").then((mod) => ({
    default: mod.StudioVrmProjectArchiveAttestationHost,
  })),
);

function MountedSignal({ onMounted }: { readonly onMounted: () => void }): null {
  useEffect(() => {
    onMounted();
  }, [onMounted]);
  return null;
}

export function StudioVrmProjectArchiveAttestationHost(): ReactElement | null {
  const [activated, setActivated] = useState(false);
  const waitersRef = useRef<Array<(ok: boolean) => void>>([]);
  const mountedRef = useRef(false);

  useEffect(() => {
    const waiters = waitersRef.current;
    const owner = Symbol("studio-vrm-project-archive-attestation-lazy-shell");
    const activate = (): Promise<boolean> => {
      if (mountedRef.current) return Promise.resolve(true);
      setActivated(true);
      return new Promise<boolean>((resolve) => {
        waiters.push(resolve);
      });
    };
    const unregister = registerStudioVrmArchiveAttestationLazyHostOwner({ owner, activate });
    return () => {
      unregister();
      mountedRef.current = false;
      const pending = waiters.splice(0);
      for (const resolve of pending) resolve(false);
    };
  }, []);

  const handleMounted = useCallback(() => {
    mountedRef.current = true;
    const pending = waitersRef.current.splice(0);
    for (const resolve of pending) resolve(true);
  }, []);

  if (!activated) return null;

  return (
    <Suspense fallback={null}>
      <LazyStudioVrmProjectArchiveAttestationHost />
      <MountedSignal onMounted={handleMounted} />
    </Suspense>
  );
}
