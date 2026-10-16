import { Fragment } from "react";

import {
  STUDIO_BG3D_ASSET_RIGHTS_DISCLAIMER,
  describeStudioBg3dAssetRightsBasisNotice,
  describeStudioBg3dAssetRightsRows,
  describeStudioBg3dAssetRightsSummary,
} from "./studio-bg3d-asset-rights-copy";
import { cx } from "./studio-bg3d-asset-panel-styles";

import type { StudioBg3dAssetRightsView } from "./studio-bg3d-asset-rights-view";

/** 카드의 한 줄 권리 요약. 권리를 모르면 강조색으로 "확인 필요"를 드러내고, 허용처럼 보이는 색은 쓰지 않는다. */
export function StudioBg3dAssetRightsSummary({ view, id }: { readonly view: StudioBg3dAssetRightsView; readonly id: string }) {
  const summary = describeStudioBg3dAssetRightsSummary(view);
  return (
    <span
      id={id}
      title={summary}
      className={cx(
        "mt-1 line-clamp-2 block text-[0.62rem] font-semibold leading-snug",
        view.state.license === "unknown" ? "text-accent" : "text-fg-2",
      )}
    >
      {summary}
    </span>
  );
}

interface StudioBg3dAssetRightsDetailsProps {
  readonly view: StudioBg3dAssetRightsView;
  readonly id: string;
  /** 영역 이름을 주는 요소의 id(여는 버튼). */
  readonly labelledBy: string;
}

/** 펼친 카드의 권리 상세. 출처·라이선스·표기 의무·상업 사용 여부를 먼저 보이고 모르는 칸은 모두 '미확인'이다. */
export function StudioBg3dAssetRightsDetails({ view, id, labelledBy }: StudioBg3dAssetRightsDetailsProps) {
  const notice = describeStudioBg3dAssetRightsBasisNotice(view);
  return (
    <div
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      className="border-t border-line/80 bg-panel/45 px-2.5 py-2"
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-[0.66rem] leading-snug">
        {describeStudioBg3dAssetRightsRows(view).map((row) => (
          <Fragment key={row.key}>
            <dt className="font-bold text-fg-2">{row.label}</dt>
            <dd className="m-0 min-w-0 break-words [overflow-wrap:anywhere]">
              <span className={row.tone === "unconfirmed" ? "font-bold text-accent" : "font-semibold text-fg"}>
                {row.value}
              </span>
              {row.userText.map((text) => (
                <span key={text} className="mt-0.5 block font-medium text-fg-3">{text}</span>
              ))}
            </dd>
          </Fragment>
        ))}
      </dl>
      {notice ? <p className="mt-2 text-[0.64rem] font-semibold leading-snug text-accent">{notice}</p> : null}
      <p className="mt-2 text-[0.6rem] leading-snug text-fg-3">{STUDIO_BG3D_ASSET_RIGHTS_DISCLAIMER}</p>
    </div>
  );
}
