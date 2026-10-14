/**
 * 휴재·복귀 키트 패널 — 공지 관리 화면에서 기간만 넣으면 휴재 공지 초안과
 * 복귀 리캡 초안이 조립되는 표면 (창의 기능 O-3).
 *
 * 조립은 hiatus-return-kit 순수 모듈이 하고, 이 컴포넌트는 입력·미리보기·
 * 저장만 소유한다. 저장은 공지 스토어의 createNotice를 그대로 쓰므로
 * 결과는 항상 "초안" 상태다 — 게시 여부는 작가가 공지 목록에서 결정한다.
 * 리캡 재료(회차 줄거리·복선)는 호출자가 작품별로 넘긴다(recapByWorkId).
 * 재료가 없는 작품은 휴재 공지만 만들 수 있고, 그 이유를 문구로 알린다.
 */

import { CalendarClock, History, Megaphone } from "lucide-react";
import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { useAuthorNoticeStore } from "./author-notice-store";
import type { AuthorNoticeDraftSeed } from "./author-notice-types";
import {
  buildHiatusNoticeKit,
  buildReturnRecapKit,
  formatKoreanDateLabel,
  type HiatusNoticeTone,
  type HiatusReasonCategory,
  type RecapEpisodeInput,
  type RecapForeshadowInput,
} from "./hiatus-return-kit";

export interface HiatusReturnKitWork {
  readonly id: string;
  readonly title: string;
}

/** 작품 하나의 리캡 재료 — 회차 줄거리 카드와 복선 장부에서 호출자가 조립해 넘긴다. */
export interface ReturnRecapSource {
  readonly episodes: readonly RecapEpisodeInput[];
  readonly foreshadows: readonly RecapForeshadowInput[];
  readonly nextEpisode?: { readonly episodeNumber: number; readonly title: string } | null;
}

export interface HiatusReturnKitPanelProps {
  readonly authorName: string;
  readonly actorId: string;
  readonly works: readonly HiatusReturnKitWork[];
  readonly recapByWorkId?: Readonly<Record<string, ReturnRecapSource>>;
}

type PanelNotice = { kind: "success" | "error"; text: string } | null;

const REASON_OPTIONS: readonly { value: HiatusReasonCategory; ko: string; en: string }[] = [
  { value: "health", ko: "건강", en: "Health" },
  { value: "personal", ko: "개인 사정", en: "Personal" },
  { value: "production", ko: "작품 재정비", en: "Production polish" },
  { value: "rest", ko: "재충전", en: "Rest" },
  { value: "other", ko: "기타", en: "Other" },
];

export function HiatusReturnKitPanel({
  authorName,
  actorId,
  works,
  recapByWorkId,
}: HiatusReturnKitPanelProps) {
  const t = useBilingual("HiatusReturnKitPanel");
  const createNotice = useAuthorNoticeStore((state) => state.createNotice);

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [workId, setWorkId] = useState<string>(works[0]?.id ?? "");
  const [reasonCategory, setReasonCategory] = useState<HiatusReasonCategory>("rest");
  const [reasonDetail, setReasonDetail] = useState("");
  const [startsOn, setStartsOn] = useState(todayKey);
  const [weeks, setWeeks] = useState(2);
  const [tone, setTone] = useState<HiatusNoticeTone>("platform");
  const [notice, setNotice] = useState<PanelNotice>(null);

  const work = works.find((item) => item.id === workId) ?? works[0];

  const kit = useMemo(
    () =>
      work
        ? buildHiatusNoticeKit({
            workTitle: work.title,
            authorName,
            reasonCategory,
            reasonDetail,
            startsOn: startsOn || todayKey,
            weeks,
            tone,
          })
        : null,
    [work, authorName, reasonCategory, reasonDetail, startsOn, todayKey, weeks, tone],
  );

  const recapSource = work ? recapByWorkId?.[work.id] : undefined;
  const recapKit = useMemo(
    () =>
      work && recapSource
        ? buildReturnRecapKit({
            workTitle: work.title,
            authorName,
            resumeOn: kit?.resumeOn,
            episodes: recapSource.episodes,
            foreshadows: recapSource.foreshadows,
            nextEpisode: recapSource.nextEpisode ?? null,
          })
        : null,
    [work, recapSource, authorName, kit?.resumeOn],
  );

  const saveDraft = (seed: AuthorNoticeDraftSeed) => {
    if (!work) return;
    const created = createNotice(
      authorName,
      {
        scope: { kind: "work", workId: work.id, workTitle: work.title },
        kind: seed.kind,
        title: seed.title,
        body: seed.body,
      },
      actorId,
    );
    setNotice(
      created
        ? {
            kind: "success",
            text: t(
              "초안으로 저장했어요. 게시 여부는 위 공지 목록에서 직접 결정하세요.",
              "Saved as a draft. Publishing is up to you in the notice list above.",
            ),
          }
        : {
            kind: "error",
            text: t(
              "초안을 저장하지 못했어요. 로그인 상태를 확인해 주세요.",
              "Could not save the draft. Please check that you are signed in.",
            ),
          },
    );
  };

  const inputClass =
    "w-full rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-sm text-fg outline-none transition placeholder:text-fg-4 focus:border-accent focus:ring-2 focus:ring-accent/25";

  if (works.length === 0) return null;

  return (
    <div className="mt-3 rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
        <CalendarClock size={15} className="text-accent" aria-hidden />
        {t("휴재·복귀 키트", "Hiatus & return kit")}
      </h3>
      <p className="mt-1 text-xs leading-5 text-fg-3">
        {t(
          "사유와 기간만 넣으면 휴재 공지 초안과 복귀 리캡 초안이 조립돼요. 저장은 항상 초안으로만 되고, 게시는 작가가 결정합니다.",
          "Enter a reason and a period to assemble a hiatus notice draft and a return recap draft. Everything saves as a draft — publishing is your call.",
        )}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-2">
          {t("작품", "Work")}
          <select
            value={work?.id ?? ""}
            onChange={(event) => setWorkId(event.target.value)}
            className={inputClass}
          >
            {works.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-2">
          {t("휴재 사유", "Reason")}
          <select
            value={reasonCategory}
            onChange={(event) => setReasonCategory(event.target.value as HiatusReasonCategory)}
            className={inputClass}
          >
            {REASON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.ko, option.en)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-2">
          {t("휴재 시작일", "Hiatus starts")}
          <input
            type="date"
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-2">
          {t("기간 (주)", "Length (weeks)")}
          <input
            type="number"
            min={1}
            max={52}
            value={weeks}
            onChange={(event) => setWeeks(Number(event.target.value))}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-2">
          {t("공지 톤", "Notice tone")}
          <select
            value={tone}
            onChange={(event) => setTone(event.target.value as HiatusNoticeTone)}
            className={inputClass}
          >
            <option value="platform">{t("플랫폼 공지 (격식)", "Platform notice (formal)")}</option>
            <option value="community">{t("커뮤니티 (친근)", "Community (friendly)")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-2">
          {t("세부 사유 (선택)", "Details (optional)")}
          <input
            value={reasonDetail}
            onChange={(event) => setReasonDetail(event.target.value)}
            placeholder={t("작가의 말로 본문에 붙어요", "Appended to the body in your words")}
            className={inputClass}
          />
        </label>
      </div>

      {kit ? (
        <div className="mt-4 rounded-xl bg-panel/60 p-4">
          <p className="text-sm text-fg-2" role="status">
            {t(
              `복귀 예정일: ${formatKoreanDateLabel(kit.resumeOn)} · 배너 문구: ${kit.bannerText}`,
              `Return date: ${kit.resumeOn} · Banner: ${kit.bannerText}`,
            )}
          </p>
          <p className="mt-3 text-sm font-semibold text-fg">{kit.seed.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-fg-2">{kit.seed.body}</p>
          <button
            type="button"
            onClick={() => saveDraft(kit.seed)}
            className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-bold text-white"
          >
            <Megaphone size={14} aria-hidden /> {t("휴재 공지 초안 저장", "Save hiatus notice draft")}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-warn" role="alert">
          {t("시작일과 기간(1주 이상)을 확인해 주세요.", "Check the start date and a length of at least 1 week.")}
        </p>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <h4 className="flex items-center gap-1.5 text-sm font-bold text-fg">
          <History size={15} className="text-accent" aria-hidden />
          {t("복귀 전 리캡", "Return recap")}
        </h4>
        {!recapSource ? (
          <p className="mt-1 text-xs leading-5 text-fg-3">
            {t(
              "이 작품의 회차 줄거리·복선 재료가 연결되면 복귀 리캡 초안이 여기에 조립돼요.",
              "Once this work's episode synopses and foreshadowing are connected, a return recap draft is assembled here.",
            )}
          </p>
        ) : !recapKit ? (
          <p className="mt-1 text-xs leading-5 text-fg-3">
            {t(
              "줄거리가 적힌 회차가 없어 리캡을 만들 수 없어요. 회차 줄거리를 먼저 채워 주세요.",
              "No episode has a synopsis yet, so a recap cannot be assembled. Fill in episode synopses first.",
            )}
          </p>
        ) : (
          <div className="mt-2 rounded-xl bg-panel/60 p-4">
            <p className="mt-0 whitespace-pre-wrap text-sm leading-6 text-fg-2">{recapKit.seed.body}</p>
            {recapKit.skippedEmptySummaryCount > 0 || recapKit.withheldSpoilerCount > 0 ? (
              <p className="mt-2 text-xs text-fg-3">
                {t(
                  `본문에서 뺀 항목: 줄거리 없는 회차 ${recapKit.skippedEmptySummaryCount}개 · 스포일러 보호 복선 ${recapKit.withheldSpoilerCount}개`,
                  `Left out of the body: ${recapKit.skippedEmptySummaryCount} episode(s) without a synopsis · ${recapKit.withheldSpoilerCount} spoiler-protected thread(s)`,
                )}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => saveDraft(recapKit.seed)}
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-bold text-white"
            >
              <History size={14} aria-hidden /> {t("복귀 리캡 초안 저장", "Save return recap draft")}
            </button>
          </div>
        )}
      </div>

      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mt-3 text-sm ${notice.kind === "error" ? "text-danger" : "text-success"}`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
