import { useEffect, useRef } from "react";

/** 그리기 표면의 DOM 핸들: 입력을 받는 스테이지, 레인 표시용 캔버스, 입력 궤적 미리보기 캔버스. */
export interface DrawSurface {
  /** 세션 키(레인·문서 크기·지우기 횟수). 세션은 자기 키의 표면에만 붙는다. */
  key: string;
  stage: HTMLDivElement;
  present: HTMLCanvasElement;
  preview: HTMLCanvasElement;
}

export interface DrawCanvasProps {
  surfaceKey: string;
  /** 문서 크기(px) = 캔버스 속성 크기. */
  width: number;
  height: number;
  /** 화면에 보이는 CSS 폭(px). 컨테이너보다 크면 컨테이너에 맞춰 줄어든다(비율 유지). */
  cssWidth: number;
  label: string;
  /** 표면이 마운트(객체)·언마운트(null)될 때 알린다. */
  onSurface: (surface: DrawSurface | null) => void;
}

/**
 * 큰 그리기 캔버스. 스테이지가 포인터 입력을 받고(`touch-action: none`) 안쪽에 레인 표시 캔버스와 궤적 미리보기 캔버스를 겹친다.
 * 레인이 WebGPU/WebGL2로 직접 표시하면 표시 캔버스의 컨텍스트 종류가 고정되므로, 레인·크기·지우기가 바뀔 때는 부모가
 * `surfaceKey`를 바꿔 이 컴포넌트를 통째로 새로 마운트한다(새 캔버스 요소).
 */
export function DrawCanvas({ surfaceKey, width, height, cssWidth, label, onSurface }: DrawCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const presentRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const present = presentRef.current;
    const preview = previewRef.current;
    if (!stage || !present || !preview) return undefined;
    onSurface({ key: surfaceKey, stage, present, preview });
    return () => onSurface(null);
  }, [surfaceKey, onSurface]);

  return (
    <div className="lab-draw-stage-wrap">
      <div
        ref={stageRef}
        className="lab-draw-stage"
        data-testid="lab-draw-stage"
        role="img"
        aria-label={label}
        style={{ width: `min(100%, ${cssWidth}px)`, aspectRatio: `${width} / ${height}` }}
      >
        <canvas ref={presentRef} className="lab-draw-canvas" width={width} height={height} data-testid="lab-draw-present" />
        <canvas
          ref={previewRef}
          className="lab-draw-canvas lab-draw-preview"
          width={width}
          height={height}
          aria-hidden="true"
          data-testid="lab-draw-preview"
        />
      </div>
    </div>
  );
}
