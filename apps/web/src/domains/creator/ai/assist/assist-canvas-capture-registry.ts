/**
 * 스튜디오가 "지금 보고 있는 페이지를 그림으로 만드는 함수"를 Claude 보조에 건네는 작은 저장소.
 *
 * 내보내기 코드는 스튜디오 에디터 안에 있어 Claude 화면이 직접 부를 수 없다. 에디터가 켜져 있는 동안만 함수를 등록해 두면
 * 이미지를 받는 보조(아트 디렉터·대체 텍스트)가 "캔버스에서 가져오기" 단추를 보인다. 스튜디오 밖(설정 화면 등)에서는 등록이 없어
 * 단추가 나타나지 않는다. 이 모듈은 스튜디오 진입 번들에 실리므로 React 외에는 아무것도 가져오지 않는다.
 */
import { useSyncExternalStore } from "react";

/** 현재 페이지를 캔버스로 그려 돌려준다. 만들 수 없으면 null. 돌려받은 캔버스는 받은 쪽이 비운다. */
export type StudioCanvasCapture = () => Promise<HTMLCanvasElement | null>;

let installed: StudioCanvasCapture | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** 캡처 함수를 등록한다. 돌려받은 함수를 부르면 등록을 푼다(더 나중에 등록된 것은 건드리지 않는다). */
export function installStudioCanvasCapture(capture: StudioCanvasCapture): () => void {
  installed = capture;
  emit();
  return () => {
    if (installed !== capture) return;
    installed = null;
    emit();
  };
}

export function getStudioCanvasCapture(): StudioCanvasCapture | null {
  return installed;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 지금 캔버스를 가져올 수 있는가(스튜디오 에디터가 켜져 있는가). */
export function useStudioCanvasCaptureAvailable(): boolean {
  return useSyncExternalStore(subscribe, () => installed !== null, () => false);
}

export function resetStudioCanvasCaptureForTests(): void {
  installed = null;
  listeners.clear();
}
