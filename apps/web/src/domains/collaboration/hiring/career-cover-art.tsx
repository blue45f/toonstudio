import { useState } from "react";

import type { CreatorCareerPublic } from "../../../../../../packages/contracts/src/creator-hiring";

import { TypographicCover } from "@/shared/components/typographic-cover";

/**
 * 커리어 커버 아트 — 창작자가 등록한 실제 커버 이미지를 우선 쓴다.
 *
 * 커버 이미지는 등록된 외부 주소를 참조만 하며 이곳에 복제·저장하지 않는다.
 * 주소가 없거나 불러오기에 실패하면 깨진 이미지 아이콘을 남기지 않고
 * 작품 제목의 타이포그래픽 커버로 자연스럽게 대체한다.
 */
export function CareerCoverArt({
  item,
  className = "",
}: {
  item: CreatorCareerPublic;
  /** 비율·너비 등 배치 클래스. 이미지와 타이포 커버가 같은 골격을 유지한다. */
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = item.coverImageUrl;

  if (url && failedUrl !== url) {
    return (
      <img
        src={url}
        alt={`${item.title} 대표 커버`}
        className={`object-cover ${className}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(url)}
      />
    );
  }
  return <TypographicCover title={item.title} seed={item.id} eyebrow={item.displayName} className={className} />;
}
