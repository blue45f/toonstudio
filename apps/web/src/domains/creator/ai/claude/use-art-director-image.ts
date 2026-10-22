import { useCallback, useEffect, useRef, useState } from "react";

import {
  ArtDirectorImageError,
  BROWSER_ART_DIRECTOR_IMAGE_DEPS,
  prepareArtDirectorSource,
  type ArtDirectorImageDeps,
  type ArtDirectorImageErrorCode,
  type ArtDirectorRenderedSegment,
  type ArtDirectorSource,
} from "./claude-art-director-image";

interface LoadedImage {
  readonly source: ArtDirectorSource | null;
  readonly rendered: ArtDirectorRenderedSegment | null;
  readonly segmentIndex: number;
}

const EMPTY: LoadedImage = Object.freeze({ source: null, rendered: null, segmentIndex: 0 });

export interface UseArtDirectorImageOptions {
  readonly deps?: ArtDirectorImageDeps;
  /** 이미지가 바뀌거나 지워질 때(구간 이동은 제외) 불린다. 이전 이미지의 결과를 버리는 데 쓴다. */
  readonly onSourceChange?: () => void;
}

export interface ArtDirectorImageController {
  readonly source: ArtDirectorSource | null;
  readonly rendered: ArtDirectorRenderedSegment | null;
  readonly segmentIndex: number;
  readonly preparing: boolean;
  readonly errorCode: ArtDirectorImageErrorCode | null;
  load(file: Blob): Promise<void>;
  select(index: number): Promise<void>;
  clear(): void;
}

function codeOf(error: unknown): ArtDirectorImageErrorCode {
  return error instanceof ArtDirectorImageError ? error.code : "unreadable";
}

/**
 * 올린 이미지의 수명을 맡는다: 검증·디코드·구간 그리기와, 바뀌거나 닫힐 때의 비트맵·미리보기 주소 해제.
 * 파일을 연달아 올려도 마지막 요청만 반영하고 앞선 요청이 만든 자원은 곧바로 해제한다.
 */
export function useArtDirectorImage(options: UseArtDirectorImageOptions = {}): ArtDirectorImageController {
  const { deps = BROWSER_ART_DIRECTOR_IMAGE_DEPS, onSourceChange } = options;
  const [loaded, setLoaded] = useState<LoadedImage>(EMPTY);
  const [preparing, setPreparing] = useState(false);
  const [errorCode, setErrorCode] = useState<ArtDirectorImageErrorCode | null>(null);
  const latest = useRef<LoadedImage>(EMPTY);
  const token = useRef(0);

  useEffect(() => {
    latest.current = loaded;
  }, [loaded]);

  useEffect(() => () => {
    token.current += 1;
    latest.current.rendered?.dispose();
    latest.current.source?.dispose();
  }, []);

  const replace = useCallback((next: LoadedImage) => {
    const previous = latest.current;
    latest.current = next;
    setLoaded(next);
    if (previous.rendered && previous.rendered !== next.rendered) previous.rendered.dispose();
    if (previous.source && previous.source !== next.source) previous.source.dispose();
  }, []);

  const load = useCallback(async (file: Blob) => {
    const mine = ++token.current;
    setPreparing(true);
    setErrorCode(null);
    try {
      const source = await prepareArtDirectorSource(file, deps);
      let first: ArtDirectorRenderedSegment;
      try {
        first = await source.render(0);
      } catch (error) {
        source.dispose();
        throw error;
      }
      if (mine !== token.current) {
        first.dispose();
        source.dispose();
        return;
      }
      replace({ source, rendered: first, segmentIndex: 0 });
      onSourceChange?.();
    } catch (error) {
      if (mine === token.current) setErrorCode(codeOf(error));
    } finally {
      if (mine === token.current) setPreparing(false);
    }
  }, [deps, onSourceChange, replace]);

  const select = useCallback(async (index: number) => {
    const current = latest.current;
    if (!current.source || index === current.segmentIndex) return;
    const mine = ++token.current;
    setPreparing(true);
    setErrorCode(null);
    try {
      const next = await current.source.render(index);
      if (mine !== token.current || latest.current.source !== current.source) {
        next.dispose();
        return;
      }
      replace({ source: current.source, rendered: next, segmentIndex: index });
    } catch (error) {
      if (mine === token.current) setErrorCode(codeOf(error));
    } finally {
      if (mine === token.current) setPreparing(false);
    }
  }, [replace]);

  const clear = useCallback(() => {
    token.current += 1;
    replace(EMPTY);
    setPreparing(false);
    setErrorCode(null);
    onSourceChange?.();
  }, [onSourceChange, replace]);

  return {
    source: loaded.source,
    rendered: loaded.rendered,
    segmentIndex: loaded.segmentIndex,
    preparing,
    errorCode,
    load,
    select,
    clear,
  };
}
