import { CheckCheck, Headphones, Radio, ShieldCheck, Users } from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  acknowledgeTopicReadAndTodos,
  DEFAULT_STUDIO_COLLABORATION_TOPICS,
  evaluateTopicSubteamHuddleSummary,
  toggleTopicLiveHuddle,
  type StudioCollaborationTopic,
} from "./collaboration-topic-subteam-huddle-model";
import { collabButton, collabInput } from "./collaboration-ui";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function CollaborationTopicSubteamHuddleSuite() {
  const bt = useBilingual("domains.collaboration.CollaborationTopicSubteamHuddleSuite");
  const tableCaptionId = useId();
  const cutCodeInputId = useId();
  const cutCodeHintId = useId();

  const [topics, setTopics] = useState<readonly StudioCollaborationTopic[]>(
    DEFAULT_STUDIO_COLLABORATION_TOPICS,
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string>("topic-ep12-color-fx");
  const [cutCodeInput, setCutCodeInput] = useState<string>("EP12-C045");

  const summary = useMemo(() => evaluateTopicSubteamHuddleSummary(topics), [topics]);

  function handleLaunchHuddleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTopics((prev) => toggleTopicLiveHuddle(prev, selectedTopicId, cutCodeInput));
  }

  return (
    <section
      aria-label={bt(
        "토픽 폴더·서브팀 허들·준회원 읽음 확인 워크벤치",
        "Topic Folder, Subteam Huddle & Associate Read-Receipt Workbench",
      )}
      className="rounded-2xl border border-line bg-panel p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-wider text-fg-3 uppercase">
            {bt("Slack + JANDI REA 내재화", "Slack + JANDI REA Internalized")}
          </p>
          <h2 className="mt-1 text-base font-bold text-fg">
            {bt(
              "회차별 토픽 폴더 · @subteam 캔버스 허들 · 준회원(외주) 읽음 확인 & 할일(Todo) 스위트",
              "Episode Topic Folders · @subteam Canvas Huddle · Associate Read-Receipt & Todo Suite",
            )}
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-3">
            {bt(
              "잔디(JANDI)의 회차·공정별 토픽 폴더 및 준회원(외주 어시스턴트) 타 토픽 열람 차단과 Slack의 @subteam 그룹 멘션·실시간 컷 허들(Huddle)을 통합합니다.",
              "Combines JANDI's episode/stage topic folders, associate guest scope isolation, and read-receipt tracking with Slack's @subteam mentions and live cut huddles.",
            )}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
            summary.allReceiptsAcknowledged
              ? "border-good/40 bg-good/10 text-good"
              : "border-warn/40 bg-warn/10 text-warn"
          }`}
        >
          <CheckCheck size={14} aria-hidden="true" />
          {summary.allReceiptsAcknowledged
            ? bt("전 공정 읽음 확인 완료 (미열람 0명)", "All Instructions Read (0 Unread)")
            : bt(
                `미열람 지시사항 ${summary.totalUnreadReceipts}명 대기`,
                `${summary.totalUnreadReceipts} Crew Unread Pending`,
              )}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3 text-xs">
          <p className="text-fg-3">{bt("라이브 캔버스 허들(Huddle)", "Active Canvas Huddles")}</p>
          <p className="mt-1 flex items-center gap-1.5 text-base font-bold text-fg tabular-nums">
            <Headphones size={15} className="text-accent" aria-hidden="true" />
            {bt(
              `${summary.activeHuddleCount}개 세션 활성`,
              `${summary.activeHuddleCount} live sessions`,
            )}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-card p-3 text-xs">
          <p className="text-fg-3">{bt("공정별 할일(Todo) 완료율", "Stage Todo Completion")}</p>
          <p className="mt-1 text-base font-bold text-fg tabular-nums">
            {summary.overallTodoCompletionRatePct}%
          </p>
        </div>
        <div className="rounded-xl border border-line bg-card p-3 text-xs">
          <p className="text-fg-3">{bt("준회원(외주) 타 회차 격리", "Associate Guest Isolation")}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-good">
            <ShieldCheck size={15} aria-hidden="true" />
            {bt(
              `${summary.associateSafeCount}/${topics.length} 토픽 격리 보호`,
              `${summary.associateSafeCount}/${topics.length} Topics Isolated`,
            )}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-card p-3 text-xs">
          <p className="text-fg-3">{bt("미열람 읽음 확인(Read Receipt)", "Unread Instructions")}</p>
          <p className="mt-1 flex items-center gap-1.5 text-base font-bold text-fg tabular-nums">
            <Users size={15} aria-hidden="true" />
            {bt(`${summary.totalUnreadReceipts}명 미확인`, `${summary.totalUnreadReceipts} unread`)}
          </p>
        </div>
      </div>

      {/* 반응형 토픽 폴더 & 읽음 확인 테이블 (modern-web-guidance: responsive-table) */}
      <div
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Modern Web Guidance responsive-table keyboard scrollable region
        tabIndex={0}
        role="region"
        aria-labelledby={tableCaptionId}
        className="mt-4 max-w-full overflow-x-auto rounded-xl border border-line"
      >
        <table className="w-full border-separate border-spacing-0 text-left text-xs">
          <caption id={tableCaptionId} className="sr-only">
            {bt(
              "회차별 토픽 폴더, 서브팀 핸들, 준회원 권한 범위, 라이브 허들 및 읽음 확인 표",
              "Episode topic folders, subteam handles, associate access scope, live huddle, and read-receipt table",
            )}
          </caption>
          <thead className="sticky top-0 z-10 bg-raised text-fg-2">
            <tr>
              <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">
                {bt("토픽 폴더 & 채널명 (JANDI)", "Topic Folder & Channel")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">
                {bt("@subteam 호출 그룹 (Slack)", "@subteam Handle")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">
                {bt("준회원(외주) 접근 권한", "Associate Access Scope")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">
                {bt("라이브 컷 허들", "Live Cut Huddle")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">
                {bt("읽음 확인 / 할일(Todo)", "Read Receipt / Todos")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">
                {bt("확인 처리", "Action")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-panel">
            {topics.map((topic) => {
              const unread = Math.max(0, topic.totalMembers - topic.readReceiptCount);
              return (
                <tr key={topic.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-[1] bg-panel px-3 py-2.5 font-semibold text-fg"
                  >
                    <div className="text-[0.6875rem] text-fg-3">
                      {bt(topic.folderNameKo, topic.folderNameEn)}
                    </div>
                    <div>{bt(topic.topicTitleKo, topic.topicTitleEn)}</div>
                  </th>
                  <td className="px-3 py-2.5 font-mono text-fg-2">{topic.subteamHandle}</td>
                  <td className="px-3 py-2.5 text-fg-2">
                    {topic.accessScope === "regular-member-only"
                      ? bt("정회원 전용 (내부 스튜디오)", "Regular Crew Only")
                      : bt("준회원 초청 허용 (타 토픽 차단)", "Associate Guest Scoped")}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[0.6875rem] ${
                        topic.huddleActive
                          ? "bg-good/15 font-semibold text-good"
                          : "bg-card text-fg-3"
                      }`}
                    >
                      <Radio size={12} aria-hidden="true" />
                      {topic.huddleActive
                        ? bt(`ON (${topic.huddleCutCode})`, `ON (${topic.huddleCutCode})`)
                        : bt(`대기 (${topic.huddleCutCode})`, `Idle (${topic.huddleCutCode})`)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-fg-2 tabular-nums">
                    <div>
                      {bt(
                        `읽음 ${topic.readReceiptCount}/${topic.totalMembers}명`,
                        `Read ${topic.readReceiptCount}/${topic.totalMembers}`,
                      )}
                      {unread > 0 ? (
                        <span className="ml-1 font-semibold text-warn">
                          ({bt(`미열람 ${unread}명`, `${unread} unread`)})
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[0.6875rem] text-fg-3">
                      {bt(
                        `Todo ${topic.todoCompletedCount}/${topic.todoTotalCount} 완료`,
                        `Todo ${topic.todoCompletedCount}/${topic.todoTotalCount} done`,
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {unread === 0 && topic.todoCompletedCount === topic.todoTotalCount ? (
                      <span className="font-semibold text-good">
                        {bt("전원 열람·완료", "All Read & Done")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={collabButton}
                        onClick={() =>
                          setTopics((prev) => acknowledgeTopicReadAndTodos(prev, topic.id))
                        }
                      >
                        {bt("읽음·할일 일괄 완료", "Acknowledge Read & Todos")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Slack 캔버스 허들(Huddle) 컷 전환 폼 (modern-web-guidance: forms) */}
      <form
        onSubmit={handleLaunchHuddleSubmit}
        className="mt-4 rounded-xl border border-line bg-card p-3.5 text-xs"
      >
        <fieldset className="space-y-3">
          <legend className="font-bold text-fg">
            {bt(
              "토픽별 실시간 컷 화면공유 허들(Huddle) 토글 및 대상 컷 코드 지정",
              "Toggle Live Cut Screen-Share Huddle & Target Cut Code",
            )}
          </legend>
          <div className="flex flex-wrap gap-3">
            {topics.map((topic) => (
              <label
                key={topic.id}
                className="inline-flex cursor-pointer items-center gap-1.5 text-fg-2"
              >
                <input
                  type="radio"
                  name="huddle_target_topic"
                  value={topic.id}
                  checked={selectedTopicId === topic.id}
                  onChange={() => setSelectedTopicId(topic.id)}
                />
                <span>{bt(topic.topicTitleKo, topic.topicTitleEn)}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <label htmlFor={cutCodeInputId} className="block font-semibold text-fg-2">
                {bt("허들 공유 대상 컷 코드", "Huddle Target Cut Code")}
              </label>
              <input
                id={cutCodeInputId}
                name="huddle_cut_code"
                type="text"
                required
                value={cutCodeInput}
                onChange={(e) => setCutCodeInput(e.target.value)}
                aria-describedby={cutCodeHintId}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className={`${collabInput} mt-1 font-mono`}
              />
              <span id={cutCodeHintId} className="mt-0.5 block text-[0.6875rem] text-fg-3">
                {bt(
                  "영문·숫자 컷 식별자(예: EP12-C045)는 자동 교정 없이 그대로 허들 세션에 바인딩됩니다.",
                  "Cut code identifiers bind directly to the live huddle session without autocorrect.",
                )}
              </span>
            </div>
            <button type="submit" className={collabButton}>
              {bt("선택 토픽 허들 토글", "Toggle Topic Huddle")}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
