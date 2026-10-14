/**
 * 대본 가져오기 표면 — 대본 텍스트를 붙여넣거나 파일로 열면 씬·지문·대사를 나눠
 * 스토리보드 플래너 비트 초안으로 만든다.
 *
 * 파싱·변환은 순수 모델(studio-screenplay-import)이 하고, 이 표면은 입력·미리보기·
 * 이슈 표시만 맡는다. "비트 초안으로 추가"를 눌러야 onImportBeats로 비트가 넘어가며,
 * 추가된 비트는 출처 표시 없는 일반 비트라 바로 편집할 수 있다.
 * 파싱 이슈(빈 씬·대사만 있는 씬)는 숨기지 않고 줄 번호와 함께 보여준다.
 */
import { useMemo, useRef, useState, type ReactElement } from "react";

import {
  buildScreenplayImportDraft,
  type ScreenplayImportDraft,
} from "./studio-screenplay-import";
import type { StudioStoryBeat } from "./studio-storyboard-planner";

import { cn } from "@/shared/lib/utils";

export interface StudioScreenplayImportPanelProps {
  /** 비트 초안을 플래너에 반영하는 콜백. 비트 상태 소유는 호스트 몫이다. */
  onImportBeats: (beats: readonly StudioStoryBeat[]) => void;
  /** 화자 이름 → 캐릭터 id. 주면 대사 비트에 characterIds가 채워진다. */
  characterIdByName?: Readonly<Record<string, string>>;
  /** 장소 표기 → locationId. */
  locationIdByName?: Readonly<Record<string, string>>;
  idPrefix?: string;
  startOrder?: number;
}

const PLACEHOLDER = [
  "S#1 카페 - 낮",
  "지훈이 창가에 앉아 있다.",
  "지훈: 오늘도 늦었네.",
  "민아: 미안, 차가 막혀서.",
  "",
  "S#2 거리 - 밤",
  "두 사람이 말없이 걷는다.",
].join("\n");

export function StudioScreenplayImportPanel({
  onImportBeats,
  characterIdByName,
  locationIdByName,
  idPrefix,
  startOrder,
}: StudioScreenplayImportPanelProps): ReactElement {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const draft: ScreenplayImportDraft | null = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return buildScreenplayImportDraft(text, {
        characterIdByName,
        locationIdByName,
        idPrefix,
        startOrder,
      });
    } catch {
      // 변환 옵션 계약 위반 등 — 대본 내용 탓이 아니므로 미리보기만 비운다.
      return null;
    }
  }, [text, characterIdByName, locationIdByName, idPrefix, startOrder]);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    void file.text().then((content) => {
      setText(content);
      setFileName(file.name);
      setImportedCount(null);
    }).catch(() => {
      setFileName(null);
    });
  };

  const handleImport = () => {
    if (!draft || draft.beats.length === 0) return;
    onImportBeats(draft.beats);
    setImportedCount(draft.beats.length);
  };

  return (
    <section aria-label="대본 가져오기" className="rounded-2xl border border-line bg-card/40 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-xs font-bold text-fg">대본 가져오기</h3>
        <p className="text-[11px] text-fg-3">
          대본을 붙여넣거나 파일로 열면 씬·지문·대사로 나눠 콘티 비트 초안을 만듭니다.
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-fg"
        >
          대본 파일 열기 (.txt)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.fountain,.md,text/plain"
          className="hidden"
          aria-label="대본 파일 선택"
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {fileName ? <span className="text-[11px] text-fg-3">{fileName}</span> : null}
        <span className="text-[11px] text-fg-3">
          씬 표기: S#1 · 씬 1 · INT./EXT. · 1. 장소 / 대사: 이름: 대사 / 메모: // 또는 ※
        </span>
      </div>

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setImportedCount(null);
        }}
        placeholder={PLACEHOLDER}
        rows={8}
        aria-label="대본 텍스트"
        className="mt-2 w-full resize-y rounded-xl border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent/60"
      />

      {!draft ? (
        <p className="mt-2 text-[11px] leading-relaxed text-fg-3">
          대본을 넣으면 씬별 비트와 대사 목록을 미리 보여주고, 확인한 뒤 플래너 초안으로 추가합니다.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[11px] text-fg-2" role="status">
            {`씬 ${draft.stats.sceneCount}개 · 비트 ${draft.beats.length}개 · 대사 ${draft.stats.dialogueCount}개 · 지문 ${draft.stats.actionCount}개`}
            {draft.stats.speakers.length > 0 ? ` · 화자 ${draft.stats.speakers.join(", ")}` : ""}
          </p>

          {draft.issues.length > 0 ? (
            <div className="mt-2 rounded-xl border border-line bg-panel px-3 py-2">
              <p className="text-[11px] font-semibold text-fg-2">파싱 확인이 필요한 곳</p>
              <ul className="mt-1 space-y-0.5">
                {draft.issues.map((issue) => (
                  <li key={`${issue.kind}-${issue.line}`} className="text-[11px] text-fg-3">
                    {`${issue.line}행 · ${issue.message}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ul className="mt-2 space-y-2">
            {draft.scenes.map((scene) => (
              <li key={scene.sceneId} className="rounded-xl border border-line bg-panel px-3 py-2">
                <p className="text-[11px] font-semibold text-fg">
                  {scene.heading}
                  <span className="ml-2 font-normal text-fg-3">
                    {`비트 ${scene.beatIds.length}개 · 예상 패널 ${scene.panelCountEstimate}개`}
                  </span>
                </p>
                {scene.dialogueLines.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {scene.dialogueLines.map((line, index) => (
                      <li key={index} className="text-[11px] text-fg-2">
                        {line.speaker ? `${line.speaker}: ${line.text}` : line.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] text-fg-3">대사 없음</p>
                )}
                {scene.notes.map((note, index) => (
                  <p key={index} className="mt-1 text-[11px] text-fg-3">{`메모 · ${note}`}</p>
                ))}
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={draft.beats.length === 0}
              onClick={handleImport}
              className={cn(
                "inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-semibold transition-colors",
                draft.beats.length === 0
                  ? "cursor-not-allowed bg-card text-fg-3 opacity-50"
                  : "bg-accent text-on-accent hover:opacity-90",
              )}
            >
              {`비트 초안 ${draft.beats.length}개 추가`}
            </button>
            {importedCount !== null ? (
              <span className="text-[11px] text-fg-2" role="status">
                {`비트 ${importedCount}개를 플래너 초안으로 추가했어요. 일반 비트처럼 바로 편집할 수 있습니다.`}
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
