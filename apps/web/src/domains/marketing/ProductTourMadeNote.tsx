import { ArrowUpRight, ChevronDown } from "lucide-react";

import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  PRODUCT_TOUR_MEDIA_ATLAS_LINKS,
  productTourAtlasHref,
} from "./public/product-tour-tech-links";

/**
 * 투어 하단의 접힌 기술 노트: 이 영상이 어떻게 만들어지고 재생되는지 네 줄로 정리한다.
 * 사실은 코드로 확인한 것만 적는다 — 8분 투어는 웹앱이 Remotion 을 직접 가져와 합성하고, 24초 브랜드 필름은 사전 렌더 MP4 다.
 * Remotion 라이선스 자격은 저장소로 확인할 수 없다고만 적고 법률 판단은 하지 않는다.
 */
export function ProductTourMadeNote() {
  const bi = useBilingualLocalizer("domains.marketing.ProductTourMadeNote");
  const lines: readonly string[] = [
    bi(
      "8분 투어는 웹앱이 remotion·@remotion/player 와 공유 컴포지션(@toonstudio/product-tour-film)을 직접 가져와 <Player> 로 브라우저에서 실시간 합성합니다. 같은 컴포지션을 MP4 로도 렌더해 ‘호환 재생’(?player=mp4)으로 제공합니다.",
      "The 8-minute tour is composed live in the browser: the web app imports remotion, @remotion/player and the shared composition (@toonstudio/product-tour-film) and plays it with <Player>. The same composition is also rendered to MP4 and offered as ‘Compatibility playback’ (?player=mp4).",
    ),
    bi(
      "24초 브랜드 필름은 미리 렌더한 MP4(가로·세로·정사각 3종)이고, 웹앱은 컴포지션을 가져오지 않고 파일로만 서빙합니다.",
      "The 24-second brand film is a set of pre-rendered MP4s (landscape, portrait, square); the web app serves the files and does not import the composition.",
    ),
    bi(
      "Range 요청을 무시하는 CDN 에서도 챕터 이동이 되도록 검증한 파일을 통째로 받아 Blob 주소로 재생하고, 자막은 같은 큐 스펙에서 만든 WebVTT 와 재생 중 자막을 씁니다.",
      "To keep chapter jumps working even on a CDN that ignores Range requests, a verified file is downloaded whole and played from a Blob URL. Captions come from the same cue spec, as WebVTT files and as in-player captions.",
    ),
    bi(
      "내레이션은 합성 음성, 배경음은 AI로 생성한 오리지널 OST 2곡입니다. Remotion 라이선스는 조직 규모별 조건이 있으며, 운영 조직의 사용 자격은 이 저장소만으로 확인할 수 없습니다.",
      "The narration is a synthesized voice and the music is two AI-generated original OST tracks. Remotion's license has conditions by organization size, and the operating organization's eligibility cannot be confirmed from this repository alone.",
    ),
  ];
  return (
    <details className="mk-fold product-tour__made" data-product-tour-made="">
      <summary>
        <span className="mk-fold__text">
          <span className="mk-fold__title">{bi("이 영상은 어떻게 만들었나", "How this film was made")}</span>
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <div className="product-tour__made-body">
        <ul className="product-tour__made-list">
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <div className="product-tour__made-links">
          <p>{bi("기술 도감에서 자세히 보기", "More in the tech atlas")}</p>
          <ul className="product-tour__tech-chips">
            {PRODUCT_TOUR_MEDIA_ATLAS_LINKS.map((link) => (
              <li key={link.atlasId}>
                <Link className="mk-chip" href={productTourAtlasHref(link.atlasId)}>
                  {bi(link.label.ko, link.label.en)}
                  <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <Link className="mk-link" href="/about/technology/videos">
            {bi("기술 영상 페이지 (Remotion 제작 구조)", "Engineering film page (Remotion production)")}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </details>
  );
}
