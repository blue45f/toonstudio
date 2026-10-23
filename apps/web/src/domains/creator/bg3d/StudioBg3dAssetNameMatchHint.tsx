import { useT } from "@/shared/lib/i18n";

import { NOTICE_TEXT, cx } from "./studio-bg3d-asset-panel-styles";

/** 한 번에 보여 주는 일치한 이름 수. 넘으면 "외 N개"로 줄인다. */
const MAX_SHOWN_NAMES = 3;

interface StudioBg3dAssetNameMatchHintProps {
  /** 라이브러리 검색어(소문자). 비어 있으면 아무것도 그리지 않는다. */
  readonly query: string;
  readonly entryName: string;
  /** 가져온 .skp 가 남긴 컴포넌트·태그(레이어)·장면 이름. */
  readonly names: readonly string[] | undefined;
}

/**
 * 소재 이름이 아니라 파일 안의 컴포넌트·태그·장면 이름이 검색어와 맞았을 때, 왜 이 소재가 찾아졌는지 카드 아래에 글자로 알린다.
 * 소재 이름이 이미 맞았다면 보이지 않는다. 이름은 믿을 수 없는 글이라 링크나 마크업으로 풀지 않는다.
 */
export function StudioBg3dAssetNameMatchHint({ query, entryName, names }: StudioBg3dAssetNameMatchHintProps) {
  const t = useT();
  if (!query || !names || names.length === 0) return null;
  if (entryName.toLocaleLowerCase("ko-KR").includes(query)) return null;
  const matched = names.filter((name) => name.toLocaleLowerCase("ko-KR").includes(query));
  if (matched.length === 0) return null;
  const shown = matched.slice(0, MAX_SHOWN_NAMES).join(", ");
  const extra = matched.length - MAX_SHOWN_NAMES;
  return (
    <p className={cx(NOTICE_TEXT, "border-t border-line/80 bg-panel/45 px-2.5 py-1.5")} data-studio-bg3d-name-match="">
      {extra > 0
        ? t("studio.bg3dScene.library.nameMatchMore", { names: shown, count: extra }, "원본 이름 일치: {names} 외 {count}개")
        : t("studio.bg3dScene.library.nameMatch", { names: shown }, "원본 이름 일치: {names}")}
    </p>
  );
}
