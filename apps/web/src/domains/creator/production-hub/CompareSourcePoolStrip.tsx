import { FilePlus2, Link2, Pin, X } from "lucide-react";
import { useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { compareSourceKey, type ComparePoolItem, type CompareSourceKind } from "./compare-review-model";

const SOURCE_BADGE: Readonly<Record<CompareSourceKind, { readonly ko: string; readonly en: string }>> = {
  revision: { ko: "버전", en: "Version" },
  external: { ko: "외부", en: "External" },
  page: { ko: "회차", en: "Episode" },
  reference: { ko: "레퍼런스", en: "Reference" },
};

/** 풀 추가 작업의 진행 상태. 파일 읽기·URL 확인은 호출 측(룸)이 맡고 결과만 표시한다. */
export type ComparePoolStatus =
  | { readonly state: "idle" }
  | { readonly state: "adding"; readonly message: string }
  | { readonly state: "error"; readonly message: string };

export interface CompareSourcePoolStripProps {
  readonly items: readonly ComparePoolItem[];
  /** 현재 페인에 배치된 소스 키들. 칩에 배치 순서(1,2,3,4)를 표시한다. */
  readonly paneSourceKeys: readonly string[];
  readonly onTogglePane: (item: ComparePoolItem) => void;
  readonly onAddFiles: (files: readonly File[]) => void;
  readonly onAddUrl: (url: string, rightsNote: string) => void;
  readonly onRemove: (item: ComparePoolItem) => void;
  /** 핀 모드: 켜면 페인 클릭이 핀 작성으로 동작한다(뷰어 상태와 공유). */
  readonly pinMode: boolean;
  readonly onTogglePinMode: () => void;
  readonly status?: ComparePoolStatus;
  /** 읽기 전용(외부 검수 등)이면 추가·제거를 숨긴다. */
  readonly readOnly?: boolean;
}

/**
 * 비교 검수의 소스 풀 띠.
 * 풀 항목을 칩으로 보여 주고 클릭으로 페인에 배치한다. 파일 드롭/선택/URL 추가는
 * 의도(intent)만 위로 올리고, 검증·저장은 호출 측이 맡는다(순수 모델 원칙).
 */
export function CompareSourcePoolStrip({
  items,
  paneSourceKeys,
  onTogglePane,
  onAddFiles,
  onAddUrl,
  onRemove,
  pinMode,
  onTogglePinMode,
  status,
  readOnly = false,
}: CompareSourcePoolStripProps) {
  const bt = useBilingual("CompareReview");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [rightsDraft, setRightsDraft] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const adding = status?.state === "adding";

  return (
    <div
      data-compare-source-pool="true"
      onDragOver={(event) => { event.preventDefault(); if (!readOnly) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (!readOnly && event.dataTransfer.files.length) onAddFiles(Array.from(event.dataTransfer.files));
      }}
      className={cn("rounded-2xl border bg-panel p-3", dragOver ? "border-accent" : "border-line")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-black text-fg">{bt("비교 소스", "Compare sources")}</span>
        <span className="text-[0.6875rem] text-fg-3">
          {bt("이미지를 끌어다 놓거나, 골라서 페인에 배치하세요", "Drop images here, or pick items to place them in panes")}
        </span>
        <span className="ml-auto inline-flex gap-1.5">
          {!readOnly ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={adding}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-bold text-fg-2 disabled:opacity-50"
            >
              <FilePlus2 className="size-4" aria-hidden="true" /> {bt("파일 추가", "Add files")}
            </button>
          ) : null}
          <button
            type="button"
            aria-pressed={pinMode}
            onClick={onTogglePinMode}
            className={cn(
              "inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold",
              pinMode ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2",
            )}
          >
            <Pin className="size-4" aria-hidden="true" /> {bt("핀 꽂기", "Add pins")}
          </button>
        </span>
      </div>

      {!readOnly ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) onAddFiles(Array.from(event.target.files));
            event.target.value = "";
          }}
        />
      ) : null}

      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={bt("소스 풀", "Source pool")}>
        {items.map((item) => {
          const key = compareSourceKey(item.source);
          const paneIndex = paneSourceKeys.indexOf(key);
          const badge = SOURCE_BADGE[item.source.kind];
          return (
            <li key={item.id} className="group inline-flex items-stretch overflow-hidden rounded-lg border border-line bg-card">
              <button
                type="button"
                aria-pressed={paneIndex >= 0}
                onClick={() => onTogglePane(item)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 px-2.5 text-xs font-bold",
                  paneIndex >= 0 ? "bg-accent text-on-accent" : "text-fg-2",
                )}
              >
                <span className="rounded bg-black/10 px-1 text-[0.625rem]">{bt(badge.ko, badge.en)}</span>
                {item.label}
                {paneIndex >= 0 ? <span aria-label={bt(`페인 ${paneIndex + 1}`, `Pane ${paneIndex + 1}`)}>{paneIndex + 1}</span> : null}
              </button>
              {!readOnly ? (
                <button
                  type="button"
                  aria-label={bt(`${item.label} 풀에서 제거`, `Remove ${item.label} from pool`)}
                  onClick={() => onRemove(item)}
                  className="px-1.5 text-fg-3 hover:text-fg"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="text-xs text-fg-3">
            {bt("아직 소스가 없습니다. 현재 원고 버전은 자동으로 들어갑니다.", "No sources yet. Current manuscript versions are added automatically.")}
          </li>
        ) : null}
      </ul>

      {status && status.state !== "idle" ? (
        <p
          role={status.state === "error" ? "alert" : "status"}
          className={cn("mt-2 text-xs", status.state === "error" ? "font-bold text-bad" : "text-fg-3")}
        >
          {status.message}
        </p>
      ) : null}

      {!readOnly ? (
        <form
          className="mt-2 flex flex-wrap gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const url = urlDraft.trim();
            if (url) { onAddUrl(url, rightsDraft.trim()); setUrlDraft(""); setRightsDraft(""); }
          }}
        >
          <label className="sr-only" htmlFor="compare-pool-url">{bt("공개 이미지 URL", "Public image URL")}</label>
          <input
            id="compare-pool-url"
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            placeholder={bt("공개 이미지 URL 붙여넣기", "Paste a public image URL")}
            className="min-h-11 min-w-48 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
          />
          <label className="sr-only" htmlFor="compare-pool-rights">{bt("출처 메모", "Source note")}</label>
          <input
            id="compare-pool-rights"
            value={rightsDraft}
            onChange={(event) => setRightsDraft(event.target.value)}
            placeholder={bt("출처 메모 (예: 클라이언트 시안 3차)", "Source note (e.g. client brief v3)")}
            className="min-h-11 min-w-40 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
          />
          <button
            type="submit"
            disabled={adding}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-bold text-fg-2 disabled:opacity-50"
          >
            <Link2 className="size-4" aria-hidden="true" /> {bt("URL 추가", "Add URL")}
          </button>
        </form>
      ) : null}
    </div>
  );
}
