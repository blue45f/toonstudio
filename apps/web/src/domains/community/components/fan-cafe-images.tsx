import { Images } from "lucide-react";

import { isAllowedImageDataUrl } from "@/shared/lib/image-attach";
import { cn } from "@/shared/lib/utils";

// 서버 검증을 거치지만 레거시/손상 행도 방어적으로 다시 거른다.
function filterFanPostImages(images?: string[]): string[] {
  return (images ?? []).filter(isAllowedImageDataUrl);
}

// 첨부 이미지 그리드 — 상세 화면용. 원본 비율 그대로 전 장을 보여준다.
export function FanPostImages({ title, images }: { title: string; images?: string[] }) {
  const list = filterFanPostImages(images);
  if (list.length === 0) return null;
  return (
    <div className={cn("mt-3 grid gap-2", list.length === 1 ? "grid-cols-1 sm:max-w-sm" : "grid-cols-2 sm:grid-cols-3")}>
      {list.map((src, index) => (
        <img
          key={`${index}-${src.slice(-24)}`}
          src={src}
          alt={`${title} 첨부 이미지 ${index + 1}`}
          loading="lazy"
          decoding="async"
          className={cn(
            "w-full rounded-xl border border-line object-cover",
            list.length === 1 ? "max-h-96 object-contain bg-canvas/40" : "aspect-square"
          )}
        />
      ))}
    </div>
  );
}

/**
 * 피드 카드용 첨부 이미지 무대 — 팬아트·코스프레처럼 이미지가 본체인 글이
 * 본문 텍스트 아래에 묻히지 않도록 첫 이미지를 카드 폭 전체의 주인공으로 세운다.
 * 나머지 장수는 배지로 알리고, 전 장 열람은 상세 화면(FanPostImages)이 담당한다.
 */
export function FanPostCardArt({ title, images }: { title: string; images?: string[] }) {
  const list = filterFanPostImages(images);
  if (list.length === 0) return null;
  const [first, ...rest] = list;
  return (
    <figure className="relative mb-3 overflow-hidden rounded-xl border border-line">
      <img
        src={first}
        alt={`${title} 첨부 이미지 1`}
        loading="lazy"
        decoding="async"
        className="aspect-[16/10] w-full object-cover"
      />
      {rest.length > 0 ? (
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
          <Images size={12} aria-hidden="true" />
          {`+${rest.length}`}
        </span>
      ) : null}
    </figure>
  );
}
