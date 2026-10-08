import { create } from "qrcode";

/**
 * 링크 QR 코드. `qrcode` 패키지가 모듈 행렬을 만들고, 우리는 그것을 한 개의 SVG 경로로 바꾼다.
 *
 * - 비동기 PNG 변환 대신 벡터 경로를 쓰므로 화면·인쇄·오프라인 발표본 어디서든 같은 모양으로 보이고
 *   서버 렌더링(테스트·정적 HTML)에서도 그대로 나온다. 외부 리소스를 쓰지 않는다.
 * - 만들지 못하면(너무 긴 주소 등) `null`을 돌려주고, 화면은 링크 텍스트만 보여준다.
 */

export const DECK_SITE_HOST = "toonstudio.cloud";

/** 스캔이 잘 되려면 사방에 모듈 4칸 이상의 여백이 필요하다. */
const QUIET_ZONE_MODULES = 4;

export interface QrSvgModel {
  /** 여백을 포함한 한 변의 모듈 수(SVG viewBox 한 변). */
  readonly size: number;
  /** 어두운 모듈을 모두 그리는 SVG path `d` 값. */
  readonly path: string;
  /** 인코딩한 절대 주소. */
  readonly url: string;
}

/** 사이트 경로(`/…`)는 공개 호스트의 https 주소로, https 주소는 그대로 쓴다. 그 밖의 값은 null. */
export function absoluteDeckUrl(href: string, host: string = DECK_SITE_HOST): string | null {
  const trimmed = href.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return `https://${host}${trimmed}`;
  if (/^https:\/\/[^\s]+$/u.test(trimmed)) return trimmed;
  return null;
}

const cache = new Map<string, QrSvgModel | null>();

function createModel(url: string): QrSvgModel | null {
  try {
    const symbol = create(url, { errorCorrectionLevel: "M" });
    const count = symbol.modules.size;
    const commands: string[] = [];
    for (let row = 0; row < count; row += 1) {
      let column = 0;
      while (column < count) {
        if (!symbol.modules.get(row, column)) {
          column += 1;
          continue;
        }
        // 이웃한 어두운 모듈은 한 사각형으로 묶어 경로를 짧게 만든다.
        let end = column;
        while (end < count && symbol.modules.get(row, end)) end += 1;
        commands.push(`M${column + QUIET_ZONE_MODULES} ${row + QUIET_ZONE_MODULES}h${end - column}v1h-${end - column}z`);
        column = end;
      }
    }
    return { size: count + QUIET_ZONE_MODULES * 2, path: commands.join(""), url };
  } catch {
    // 주소가 너무 길면 QR 을 만들 수 없다. 호출자가 링크 텍스트만 보여준다.
    return null;
  }
}

/** 같은 주소는 한 번만 계산한다. 만들 수 없는 주소도 기억한다(null). */
export function buildQrSvgModel(url: string): QrSvgModel | null {
  const cached = cache.get(url);
  if (cached !== undefined) return cached;
  const model = createModel(url);
  cache.set(url, model);
  return model;
}

/**
 * 오프라인 발표본·정적 HTML 에 그대로 넣는 인라인 SVG 문자열(스크립트·외부 참조·`src` 속성 없음).
 * 어떤 배경에서도 스캔되도록 흰 바탕에 검은 모듈을 쓴다.
 */
export function qrSvgMarkup(model: QrSvgModel, label: string): string {
  const escape = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  return `<svg viewBox="0 0 ${model.size} ${model.size}" role="img" aria-label="${escape(label)}" shape-rendering="crispEdges"><rect width="${model.size}" height="${model.size}" fill="#fff"/><path d="${model.path}" fill="#111"/></svg>`;
}
