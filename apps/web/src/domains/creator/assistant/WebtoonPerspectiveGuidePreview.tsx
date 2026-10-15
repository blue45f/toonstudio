/**
 * WebtoonPerspectiveGuidePreview — 크로키 탭의 "선택한 투시 가이드 미리보기".
 *
 * `StudioWebtoonAssistantContent.tsx` 안에 있던 SVG 미리보기와 두 도우미를 동작 변경 없이 그대로
 * 옮겼다. 그 파일이 소스 파일 크기 래칫(`pnpm run check:source-file-size`)의 기록된 초과 파일이라
 * 줄을 늘릴 수 없는데, 새 탭을 연결하려면 줄이 필요해서 자기완결적인 이 조각을 분리했다.
 * 선택이 실제 출력을 바꾼다는 계약(지평선 위치·기울기·소실점 수가 그림과 수치에 함께 반영)은 그대로다.
 */

import type { PerspectiveGuideConfig } from "./webtoon-croquis-pose-guide";

/** 라벨 앞머리(괄호 앞)만 뽑아 짧은 접근성 이름으로 쓴다. */
function perspectiveShortLabel(label: string): string {
  const head = label.split("(")[0];
  return head.trim() === "" ? label : head.trim();
}

/** 소실점 좌표. 개수에 따라 수평 2점 + (3점이면) 지평선 반대편 수직 소실점을 얹는다. */
function perspectiveVanishingPoints(guide: {
  horizonRatioY: number;
  vanishingPointCount: 1 | 2 | 3;
}): readonly { x: number; y: number }[] {
  const horizonY = 90 * guide.horizonRatioY;
  if (guide.vanishingPointCount === 1) return [{ x: 80, y: horizonY }];
  const horizontal = [
    { x: 12, y: horizonY },
    { x: 148, y: horizonY },
  ];
  if (guide.vanishingPointCount === 2) return horizontal;
  return [...horizontal, { x: 80, y: guide.horizonRatioY < 0.5 ? 86 : 4 }];
}

export function WebtoonPerspectiveGuidePreview({ guide }: { readonly guide: PerspectiveGuideConfig }) {
  return (
    <div className="mt-1 flex flex-col gap-2 rounded-lg border border-line bg-card p-2.5 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 160 90"
        role="img"
        aria-label={`${perspectiveShortLabel(guide.label)} 가이드 미리보기`}
        className="h-24 w-full shrink-0 rounded border border-line/60 bg-canvas text-accent sm:w-40"
      >
        <g transform={`rotate(${guide.tiltAngleDeg} 80 45)`} stroke="currentColor" fill="none">
          <line
            x1={-40}
            x2={200}
            y1={90 * guide.horizonRatioY}
            y2={90 * guide.horizonRatioY}
            strokeWidth={1.4}
          />
          {perspectiveVanishingPoints(guide).map((point) => (
            <g key={`${point.x}-${point.y}`}>
              <circle cx={point.x} cy={point.y} r={3} strokeWidth={1.2} />
              <line
                x1={point.x}
                y1={point.y}
                x2={80}
                y2={45}
                strokeWidth={0.6}
                strokeDasharray="3 3"
                opacity={0.7}
              />
            </g>
          ))}
        </g>
      </svg>
      <dl className="grid flex-1 grid-cols-3 gap-2 text-center text-[0.62rem]">
        <div className="rounded border border-line bg-raised p-1.5">
          <dt className="text-fg-3">지평선 위치</dt>
          <dd className="mt-0.5 font-mono font-bold text-fg">
            {Math.round(guide.horizonRatioY * 100)}%
          </dd>
        </div>
        <div className="rounded border border-line bg-raised p-1.5">
          <dt className="text-fg-3">화면 기울기</dt>
          <dd className="mt-0.5 font-mono font-bold text-fg">{guide.tiltAngleDeg}°</dd>
        </div>
        <div className="rounded border border-line bg-raised p-1.5">
          <dt className="text-fg-3">소실점</dt>
          <dd className="mt-0.5 font-mono font-bold text-fg">{guide.vanishingPointCount}점</dd>
        </div>
      </dl>
    </div>
  );
}
