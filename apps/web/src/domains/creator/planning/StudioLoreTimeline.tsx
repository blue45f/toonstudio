/**
 * 로어 연표 전용 뷰 — story 섹션 timeline 뷰의 본문 표면.
 *
 * 원칙:
 * - 데이터는 세계관 허브와 같은 출처다: 컨테이너(StudioProjectStoryPlanning)가
 *   studio-world-lore-store 에서 읽어 props 로 넘긴 lore 를 그대로 그린다.
 *   정렬·시기 표기는 studio-lore-timeline 모델(loreTimeline 단일 출처)이 정한다.
 * - 이 뷰는 읽기 전용이다. 사건 추가·수정·삭제와 시기·순서 편집은 허브가 맡고,
 *   여기는 "시간 순서로 모아 보기"에만 집중한다. 편집 경로가 둘이 되면 순서가
 *   어긋날 수 있어, 편집으로 가는 길(worldHref)만 분명히 안내한다.
 * - 빈 상태는 두 갈래로 나눈다: 설정 자체가 없을 때(세계부터 세우기)와, 설정은
 *   있는데 연표 사건만 없을 때(사건으로 추가하기). 둘 다 출구는 허브다.
 */
import { useMemo } from "react";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";

import type { StudioStoryCharacter } from "../studio-story-bible";
import type { StudioWorldLore } from "./studio-world-lore";
import {
  buildLoreTimelineView,
  loreTimelineSummaryLine,
} from "./studio-lore-timeline";

export interface StudioLoreTimelineProps {
  readonly lore: StudioWorldLore;
  /** 연결 이름 표시용 캐릭터 목록 (바이블 정본, 읽기 전용). */
  readonly characters: readonly StudioStoryCharacter[];
  /** 세계관 설정 허브(story 뷰 world)로 가는 href — 편집 출구. 없으면 링크를 렌더하지 않는다. */
  readonly worldHref?: string;
}

export function StudioLoreTimeline({ lore, characters, worldHref }: StudioLoreTimelineProps) {
  const view = useMemo(() => buildLoreTimelineView(lore, characters), [lore, characters]);
  const summaryLine = loreTimelineSummaryLine(view);

  return (
    <section aria-label="연표">
      <header>
        <h1>연표</h1>
        <p>
          세계관 설정에 적어 둔 사건을 시간 순서로 모은 전용 보기예요. 허브의
          연표와 같은 설정을 보므로, 허브에서 사건을 고치면 여기도 바로
          따라갑니다. 사건을 추가하거나 시기·순서를 바꾸려면 세계관 설정에서
          해 주세요.
        </p>
        {worldHref && (
          <p>
            <a href={worldHref}>세계관 설정에서 사건 편집하기</a>
          </p>
        )}
      </header>

      {view.eventCount === 0 ? (
        view.totalEntryCount === 0 ? (
          <div>
            <p>{r3c04StatusText("studio.r3c04Status.planning.loreTimeline.empty", "아직 세계관 설정이 없어서 보여 줄 연표가 없어요.")}</p>
            <p>
              세계관 설정에서 장소·세력 같은 항목과 함께 사건을 적어 두면,
              그 사건들이 여기서 시간 순서대로 쌓입니다. 예시 세계로 시작하면
              연표가 어떻게 보이는지 바로 확인할 수 있어요.
            </p>
            {worldHref && (
              <p>
                <a href={worldHref}>세계관 설정으로 가기</a>
              </p>
            )}
          </div>
        ) : (
          <div>
            <p>
              설정은 {view.totalEntryCount}개 있지만, 연표에 오를 사건은 아직
              없어요.
            </p>
            <p>
              세계관 설정에서 항목 종류를 &ldquo;연표 사건&rdquo;으로 골라
              사건을 추가하고, 시기 표기(예: 대침수 12년 뒤)와 순서를 적어
              주세요. 적힌 순서 그대로 여기 나타납니다.
            </p>
            {worldHref && (
              <p>
                <a href={worldHref}>세계관 설정에서 사건 추가하기</a>
              </p>
            )}
          </div>
        )
      ) : (
        <div>
          <p>{summaryLine}</p>
          {view.undatedCount > 0 && (
            <p>
              시기 미정인 사건은 순서가 정해지지 않아 연표 맨 뒤에 이름
              순서로 놓여 있어요. 세계관 설정에서 시기 표기나 순서를 적으면
              제자리를 찾습니다.
            </p>
          )}
          <ol>
            {view.rows.map((row) => (
              <li key={row.entry.id}>
                <article aria-label={row.entry.name}>
                  <p>
                    <strong>{row.eraDisplay}</strong>
                    {row.undated ? " · 순서를 정하면 제자리로 가요" : ""}
                  </p>
                  <h2>
                    {row.entry.name}
                    {row.entry.origin === "example" ? " (예시)" : ""}
                  </h2>
                  {row.entry.summary && <p>{row.entry.summary}</p>}
                  {row.entry.details && <p>{row.entry.details}</p>}
                  {row.relatedNames.length > 0 && (
                    <p>이어지는 설정: {row.relatedNames.join(", ")}</p>
                  )}
                  {row.characterNames.length > 0 && (
                    <p>이어지는 캐릭터: {row.characterNames.join(", ")}</p>
                  )}
                </article>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
