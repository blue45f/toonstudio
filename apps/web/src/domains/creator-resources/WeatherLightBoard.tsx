import { useState } from "react";

import { TypographicCover } from "@/shared/components/typographic-cover";

interface WeatherLightPanel {
  readonly id: string;
  readonly label: string;
  readonly art: string;
  readonly alt: string;
  readonly note: string;
}

/**
 * 날씨·빛 참고판 패널 — 네 칸 모두 같은 거리 구도(webtoon_street)에서 날씨·빛만 바꾼
 * 일러스트다. 메모는 각 그림에서 실제로 읽히는 빛의 성격(그림자·색온도·반사)만 적는다.
 * 노을 칸은 기존 카탈로그 아트 webtoon_street.jpg를 그대로 쓴다.
 */
const WEATHER_LIGHT_PANELS: readonly WeatherLightPanel[] = [
  {
    id: "clear",
    label: "맑음",
    art: "/assets/studio/backgrounds/webtoon_street_clear.webp",
    alt: "맑은 날의 거리 — 왼쪽 위 태양빛에 전봇대 그림자가 노면을 가로질러 길게 드리운 같은 거리 풍경",
    note: "왼쪽 위에서 오는 직사광이라 전봇대 그림자가 노면을 가로질러 길게 드리웁니다. 명암 경계가 네 장면 중 가장 또렷합니다.",
  },
  {
    id: "overcast",
    label: "흐림",
    art: "/assets/studio/backgrounds/webtoon_street_overcast.webp",
    alt: "흐린 날의 거리 — 구름이 빛을 흩어 그림자가 사라지고 전체가 한 톤 가라앉은 같은 거리 풍경",
    note: "구름이 빛을 고르게 흩어 그림자가 거의 사라집니다. 채도가 한 톤 가라앉고 명암 경계가 부드러워집니다.",
  },
  {
    id: "rain",
    label: "비",
    art: "/assets/studio/backgrounds/webtoon_street_rain.webp",
    alt: "비 오는 거리 — 어두운 하늘 아래 젖은 노면이 간판과 전조등 빛을 아래로 길게 반사하는 같은 거리 풍경",
    note: "젖은 노면이 간판·전조등 빛을 아래로 길게 반사합니다. 전체는 어둡고 차갑지만 광원 주변의 색만 살아납니다.",
  },
  {
    id: "sunset",
    label: "노을",
    art: "/assets/studio/backgrounds/webtoon_street.jpg",
    alt: "노을의 거리 — 거리 끝 낮은 해가 건물 옆면을 주황으로 물들이는 같은 거리 풍경",
    note: "해가 거리 끝 낮은 곳에 있어 건물 옆면이 주황으로 물들고, 하늘은 위로 갈수록 보라로 식습니다. 네 장면 중 색온도가 가장 따뜻합니다.",
  },
];

function WeatherLightPanelCard({ panel }: { panel: WeatherLightPanel }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <figure className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="relative aspect-square w-full overflow-hidden bg-raised">
        {imageFailed
          ? <TypographicCover title={panel.label} seed={`weather-light-${panel.id}`} className="absolute inset-0" />
          : <img src={panel.art} alt={panel.alt} loading="lazy" decoding="async" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover" />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/25 to-transparent p-3 pt-8">
          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">{panel.label}</span>
        </div>
      </div>
      <figcaption className="flex flex-1 flex-col p-4">
        <p className="text-sm leading-6 text-fg-2">{panel.note}</p>
      </figcaption>
    </figure>
  );
}

/**
 * 날씨·빛 참고판 — /research/weather-light(날씨·빛 연출 도우미)의 본체.
 * 같은 거리 일러스트 4종을 나란히 놓고 빛의 성격만 비교하는 창작 참고용 정적 보드다.
 * 실시간 날씨·예보 데이터가 아니며, 아래 위치 예보 검색(MET Norway)과 섞지 않는다.
 * featured 큐레이션(실검색 타일)과도 별개다 — 이 보드는 검색과 무관하게 항상 놓인다.
 */
export function WeatherLightBoard() {
  return (
    <section aria-labelledby="weather-light-board-heading" className="space-y-3">
      <div>
        <h2 id="weather-light-board-heading" className="text-lg font-bold">같은 거리, 네 가지 빛</h2>
        <p className="mt-1 text-sm leading-6 text-fg-2">
          같은 거리 풍경을 맑음·흐림·비·노을로 바꿔 그린 창작 참고용 일러스트 보드입니다.
          장면의 날씨를 정할 때 그림자 방향·색온도·반사가 어떻게 달라지는지 비교하세요.
          실시간 날씨나 예보 자료가 아니며, 위치 예보 검색은 아래에서 이용합니다.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {WEATHER_LIGHT_PANELS.map((panel) => <WeatherLightPanelCard key={panel.id} panel={panel} />)}
      </div>
    </section>
  );
}
