import { motion } from "motion/react";
import { useState } from "react";

import { TypographicCover } from "@/shared/components/typographic-cover";

import type { MarketingEvent } from "./event-catalog";
import { useMarketingEventText } from "./marketing-event-copy";

/**
 * 이벤트 아트워크 — 카드 타일과 /events 대표 카드가 같은 규칙으로 아트를 고른다.
 *
 * 카탈로그의 `event.image`(이벤트 자체 아트)가 있고 로드에 성공하면 그 이미지를,
 * 아트가 없거나 로드에 실패하면 타이포그래픽 커버를 보여 준다. 공용 섹션 이미지를
 * 이벤트 아트로 대신 쓰는 폴백은 두지 않는다 — 없는 아트는 없다고 보이는 편이 정직하다.
 *
 * 루트 요소가 상대 배치 컨테이너의 크기를 그대로 채우므로, 비율·모서리는 호출부가
 * 감싸는 쪽에서 정한다. `zoomOnHover`는 카드 호버 시 이미지 확대(motion variants)를 켠다.
 */
export function EventArtwork({
  event,
  zoomOnHover = false,
  priority = false,
}: {
  event: MarketingEvent;
  zoomOnHover?: boolean;
  /** 대표 카드처럼 첫 화면의 주인공인 아트면 지연 로딩을 끈다. */
  priority?: boolean;
}) {
  const text = useMarketingEventText();
  const [failed, setFailed] = useState(false);
  const title = text(event.title);

  if (!event.image || failed) {
    return (
      <TypographicCover
        title={title}
        seed={event.id}
        eyebrow={text(event.eyebrow)}
        className="absolute inset-0 h-full w-full"
      />
    );
  }

  return (
    <motion.img
      src={event.image}
      alt=""
      aria-hidden="true"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover"
      variants={zoomOnHover ? { rest: { scale: 1 }, hover: { scale: 1.06 } } : undefined}
      transition={zoomOnHover ? { duration: 0.7, ease: "easeOut" } : undefined}
      onError={() => setFailed(true)}
    />
  );
}

export default EventArtwork;
