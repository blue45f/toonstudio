/**
 * Studio Dialogue Glossary Editor — 작품별 용어집의 행 단위 편집 표면.
 *
 * 정본은 번역 패널이 들고 있는 자유 텍스트 하나다(프롬프트 주입·번역 메모리·QA가 전부
 * 그 텍스트를 읽는다). 이 편집기는 텍스트를 규칙 행으로 **펼쳐 보여 줄 뿐** 소유하지
 * 않는다: 행을 고칠 때마다 split/serialize(studio-translation-glossary)로 같은 텍스트로
 * 되돌려 패널에 돌려준다. 텍스트로 표현할 수 없는 것(로케일 지정·대소문자 구분)은
 * 행 편집 범위에서 제외한다 — 텍스트 정본과 어긋나는 상태를 만들지 않기 위해서다.
 *
 * 규칙으로 읽히지 않은 줄(주석·자유 메모)은 메모 줄로 보존해 하단에 그대로 보여 준다.
 * 삭제는 텍스트 모드에서만 가능하다(행 편집이 메모를 조용히 지우지 않게).
 */
import { ListPlus, Rows3, TextCursorInput, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  serializeStudioGlossaryText,
  splitStudioGlossaryText,
  type StudioTranslationMemoryGlossaryRule,
} from "../studio-translation-glossary";

import { cx } from "@/shared/lib/cx";

export type StudioDialogueGlossaryEditorProps = {
  glossary: string;
  onGlossaryChange: (value: string) => void;
};

const inputClass =
  "w-full rounded-lg border border-line bg-card px-2 py-1.5 text-[0.7rem] text-fg outline-none transition-colors placeholder:text-fg-4 focus:border-accent/50";

const modeButtonClass = (active: boolean) =>
  cx(
    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.58rem] font-semibold transition-colors",
    active
      ? "border-accent/35 bg-accent-soft text-accent"
      : "border-line bg-card text-fg-3 hover:bg-raised"
  );

export function StudioDialogueGlossaryEditor({
  glossary,
  onGlossaryChange,
}: StudioDialogueGlossaryEditorProps) {
  const [mode, setMode] = useState<"text" | "rows">("text");
  const [rows, setRows] = useState<readonly StudioTranslationMemoryGlossaryRule[]>([]);
  const [memoLines, setMemoLines] = useState<readonly string[]>([]);
  // 마지막으로 내가 커밋한 텍스트 — 부모가 그대로 돌려준 에코와 외부 변경을 가른다.
  const lastCommittedRef = useRef<string | null>(null);

  const commitRows = (
    nextRules: readonly StudioTranslationMemoryGlossaryRule[],
    nextMemo: readonly string[]
  ) => {
    setRows(nextRules);
    setMemoLines(nextMemo);
    const text = serializeStudioGlossaryText(nextRules, nextMemo);
    lastCommittedRef.current = text;
    onGlossaryChange(text);
  };

  const enterRowsMode = () => {
    const parts = splitStudioGlossaryText(glossary);
    setRows(parts.rules);
    setMemoLines(parts.memoLines);
    lastCommittedRef.current = glossary;
    setMode("rows");
  };

  // 행 모드에서 용어집이 바깥에서 바뀌면(작품 전환·저장본 주입) 행을 다시 펼친다.
  useEffect(() => {
    if (mode !== "rows") return;
    if (lastCommittedRef.current === glossary) return;
    const parts = splitStudioGlossaryText(glossary);
    setRows(parts.rules);
    setMemoLines(parts.memoLines);
    lastCommittedRef.current = glossary;
  }, [glossary, mode]);

  const patchRow = (index: number, patch: Partial<StudioTranslationMemoryGlossaryRule>) => {
    commitRows(
      rows.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
      memoLines
    );
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-[0.66rem] font-medium text-fg-3" htmlFor="dialogue-translate-glossary">
          용어집(선택) — 작품별로 저장돼요
        </label>
        <div className="flex items-center gap-1" role="group" aria-label="용어집 편집 방식">
          <button
            type="button"
            aria-pressed={mode === "text"}
            onClick={() => setMode("text")}
            className={modeButtonClass(mode === "text")}
          >
            <TextCursorInput size={10} aria-hidden /> 텍스트
          </button>
          <button
            type="button"
            aria-pressed={mode === "rows"}
            onClick={enterRowsMode}
            className={modeButtonClass(mode === "rows")}
          >
            <Rows3 size={10} aria-hidden /> 규칙 행
          </button>
        </div>
      </div>

      {mode === "text" ? (
        <textarea
          id="dialogue-translate-glossary"
          value={glossary}
          onChange={(e) => onGlossaryChange(e.target.value)}
          placeholder={"예: 주인공 이름은 항상 \"Yuna\"로 번역해줘\n민수: Minsu"}
          rows={3}
          className={cx(inputClass, "resize-y leading-snug")}
        />
      ) : (
        <div className="space-y-1.5">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-2 py-3 text-center text-[0.62rem] leading-relaxed text-fg-4">
              등록된 규칙이 없어요. 행을 추가하거나 텍스트 모드에서 &ldquo;원문: 정본&rdquo;
              형식으로 입력하세요.
            </p>
          ) : (
            <ul className="space-y-1">
              {rows.map((rule, index) => (
                <li key={index} className="flex items-center gap-1">
                  <input
                    type="text"
                    value={rule.sourceTerm}
                    onChange={(e) => patchRow(index, { sourceTerm: e.target.value })}
                    placeholder="원문 표기"
                    aria-label={`${index + 1}번째 규칙 원문 표기`}
                    className={cx(inputClass, "py-1")}
                  />
                  <span className="shrink-0 text-[0.62rem] text-fg-4" aria-hidden>
                    →
                  </span>
                  <input
                    type="text"
                    value={rule.targetTerm}
                    onChange={(e) => patchRow(index, { targetTerm: e.target.value })}
                    placeholder="정본 표기"
                    aria-label={`${index + 1}번째 규칙 정본 표기`}
                    className={cx(inputClass, "py-1")}
                  />
                  <button
                    type="button"
                    onClick={() => commitRows(rows.filter((_, i) => i !== index), memoLines)}
                    aria-label={`${index + 1}번째 규칙 삭제`}
                    title="규칙 삭제"
                    className="grid size-6 shrink-0 place-items-center rounded-md border border-line text-fg-3 transition-colors hover:bg-raised"
                  >
                    <Trash2 size={11} aria-hidden />
                  </button>
                  {rule.targetTerm.trim() === "" ? (
                    <span className="shrink-0 text-[0.56rem] font-semibold text-warn">정본 미정</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => commitRows([...rows, { sourceTerm: "", targetTerm: "" }], memoLines)}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2 py-1 text-[0.62rem] font-semibold text-fg-2 transition-colors hover:bg-raised"
          >
            <ListPlus size={11} aria-hidden /> 규칙 추가
          </button>
          {memoLines.length > 0 ? (
            <div className="rounded-lg border border-line/60 bg-card/40 px-2 py-1.5">
              <p className="text-[0.58rem] font-semibold text-fg-3">
                메모 줄 {memoLines.length}개 — 규칙이 아닌 줄은 그대로 보존돼요(편집은 텍스트 모드에서)
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {memoLines.map((line, index) => (
                  <li key={index} className="truncate text-[0.6rem] text-fg-4" title={line}>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
