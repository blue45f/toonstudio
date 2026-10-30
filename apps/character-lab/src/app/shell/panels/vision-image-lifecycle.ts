import { useEffect, useMemo, useRef } from "react";

import type { DecodedImage } from "./vision-panel-deps";

interface ImageLifecycle {
  /** 방금 디코드한 이미지를 현재 이미지로 삼는다. 이미 언마운트됐으면 미리보기를 해제하고 false(분석을 이어가지 않는다). */
  track(image: DecodedImage): boolean;
  /** 화면에 남지 않을 이미지(분석 실패)의 미리보기를 해제한다. */
  discard(image: DecodedImage): void;
  clear(): void;
}

export function useImageLifecycle(): ImageLifecycle {
  const current = useRef<DecodedImage | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      current.current?.releasePreview?.();
      current.current = null;
    };
  }, []);
  return useMemo<ImageLifecycle>(
    () => ({
      track(image) {
        if (!active.current) {
          image.releasePreview?.();
          return false;
        }
        const previous = current.current;
        current.current = image;
        if (previous && previous !== image) previous.releasePreview?.();
        return true;
      },
      clear() { current.current?.releasePreview?.(); current.current = null; },
      discard(image) {
        image.releasePreview?.();
        if (current.current === image) current.current = null;
      },
    }),
    [],
  );
}
