import { useState } from "react";
import { TypographicCover } from "@/shared/components/typographic-cover";

export function CreatorArtBand({ creator }: { creator: { readonly name: string; readonly avatar: string | null; readonly userId: string } }) {
  const [failed, setFailed] = useState(false);
  // 디렉터리 API에는 작품 썸네일이 없어, 대표 아트는 아바타(없으면 이름 타이포 커버)로 대신한다.
  return (
    <span aria-hidden="true" className="-mx-4 -mt-4 mb-4 block h-28 overflow-hidden bg-raised">
      {creator.avatar && !failed ? (
        <img
          src={creator.avatar}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <TypographicCover title={creator.name} seed={creator.userId} className="h-full w-full" />
      )}
    </span>
  );
}

