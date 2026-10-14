import { describe, expect, it } from "vitest";

import {
  applyWritingPolishSuggestion,
  applyWritingPolishSuggestions,
  diffWritingWords,
  splitWritingSentences,
  suggestWritingPolish,
  suggestWritingPolishForText,
  summarizeWritingPolish,
  type WritingPolishDocument,
} from "./studio-writing-polish";
import {
  localRuleWritingPolishProvider,
  polishWithProvider,
  validateRemotePolishSuggestions,
  type WritingPolishProvider,
} from "./studio-writing-polish-provider";

const synopsis = (text: string): WritingPolishDocument => ({
  id: "ep1-synopsis",
  label: "1화 줄거리",
  kind: "synopsis",
  text,
});
const dialogue = (text: string): WritingPolishDocument => ({
  id: "dlg-1",
  label: "대사",
  kind: "dialogue",
  text,
});

describe("splitWritingSentences", () => {
  it("종결 부호·줄바꿈으로 나누고 span 이 원문 구간과 일치한다", () => {
    const text = "첫 문장이다.  둘째 문장이다!\n셋째 문장";
    const spans = splitWritingSentences(text);
    expect(spans.map((span) => span.text)).toEqual(["첫 문장이다.", "둘째 문장이다!", "셋째 문장"]);
    for (const span of spans) expect(text.slice(span.start, span.end)).toBe(span.text);
    expect(spans[1]?.start).toBe(text.indexOf("둘째"));
  });

  it("닫는 따옴표는 문장에 붙이고 빈 구간은 만들지 않는다", () => {
    const spans = splitWritingSentences('그는 "간다."라고 했다.  ');
    expect(spans).toHaveLength(2);
    expect(spans[0]?.text).toBe('그는 "간다."');
  });
});

describe("로컬 규칙 제안", () => {
  it("겹친 표현(다시 또)을 하나로 축약한다", () => {
    const [s] = suggestWritingPolishForText(synopsis("그는 다시 또 문을 열었다."));
    expect(s?.ruleIds).toContain("redundant-pair");
    expect(s?.suggested).toBe("그는 다시 문을 열었다.");
    expect(s?.charDelta).toBeLessThan(0);
  });

  it("이중 피동(되어진다)을 고치고 정상 피동(여겨진다)은 건드리지 않는다", () => {
    expect(suggestWritingPolishForText(synopsis("그의 말은 사실로 여겨진다."))).toHaveLength(0);
    const [t] = suggestWritingPolishForText(synopsis("문이 열리게 되어진다."));
    expect(t?.ruleIds).toContain("double-passive");
    expect(t?.suggested).toBe("문이 열리게 된다.");
  });

  it("장황한 표현(에 있어서·기 위하여)을 줄인다", () => {
    const [s] = suggestWritingPolishForText(synopsis("이 일에 있어서 그는 떠나기 위하여 짐을 쌌다."));
    expect(s?.ruleIds).toContain("verbose-phrase");
    expect(s?.suggested).toBe("이 일에서 그는 떠나기 위해 짐을 쌌다.");
  });

  it("시놉시스의 명사형 종결을 줄이지만 대사에서는 건드리지 않는다", () => {
    const [s] = suggestWritingPolishForText(synopsis("주인공은 결국 진실을 알게 되는 것이다."));
    expect(s?.ruleIds).toContain("nominal-ending");
    expect(s?.suggested).toBe("주인공은 결국 진실을 알게 된다.");
    expect(suggestWritingPolishForText(dialogue("그게 바로 운명인 것이다."))).toHaveLength(0);
  });

  it("할 필요가 있다 → 해야 한다 를 제안한다", () => {
    const [s] = suggestWritingPolishForText(synopsis("그는 오늘 안에 서류를 제출할 필요가 있다."));
    expect(s?.suggested).toBe("그는 오늘 안에 서류를 제출해야 한다.");
  });

  it("첫머리 군더더기와 강조 겹침은 info 등급으로만 나온다", () => {
    const [s] = suggestWritingPolishForText(dialogue("사실은 정말 정말 무서웠어."));
    expect(s?.severity).toBe("info");
    expect(s?.suggested).toBe("정말 무서웠어.");
    expect(
      suggestWritingPolishForText(dialogue("사실은 정말 정말 무서웠어."), { includeInfo: false }),
    ).toHaveLength(0);
  });

  it("군더더기만으로 이뤄진 문장은 삭제 제안하지 않는다", () => {
    expect(suggestWritingPolishForText(dialogue("사실은"))).toHaveLength(0);
  });

  it("같은 문장 반복은 뒤 문장 삭제를 제안하고 짧은 대답 반복은 제외한다", () => {
    const doc = synopsis("그는 문을 열고 안으로 들어갔다. 방은 어두웠다. 그는 문을 열고 안으로 들어갔다.");
    const dup = suggestWritingPolishForText(doc).find((s) => s.ruleIds.includes("duplicate-sentence"));
    expect(dup?.sentenceIndex).toBe(2);
    expect(dup?.suggested).toBe("");
    expect(suggestWritingPolishForText(dialogue("응. 응."))).toHaveLength(0);
  });

  it("긴 문장은 안전한 절 경계(지만/었고)에서만 나눈다", () => {
    const long =
      "주인공은 비 오는 오후 낡은 다락방 구석에서 먼지 쌓인 오래된 편지를 발견했지만, 그 안에 적힌 이름이 자신의 것과 똑같다는 사실을 알고도 한동안 아무에게도 말하지 못했다.";
    const list = suggestWritingPolishForText(synopsis(long));
    const split = list.find((s) => s.ruleIds.includes("long-sentence-split"));
    expect(split?.suggested).toContain("발견했다. 하지만");
    // 안전한 경계가 없는 긴 문장은 나누지 않는다(지어내지 않음).
    const noBoundary = "가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사.";
    expect(
      suggestWritingPolishForText(synopsis(noBoundary)).some((s) => s.ruleIds.includes("long-sentence-split")),
    ).toBe(false);
  });

  it("긴 대사 기준은 시놉시스보다 짧다", () => {
    const mid = "그는 어제 시장에서 산 빨간 사과를 집에 가져왔고, 그것을 깨끗이 씻어서 동생과 어머니와 함께 사이좋게 나누어 먹었다.";
    expect(
      suggestWritingPolishForText(dialogue(mid)).some((s) => s.ruleIds.includes("long-sentence-split")),
    ).toBe(true);
    expect(
      suggestWritingPolishForText(synopsis(mid)).some((s) => s.ruleIds.includes("long-sentence-split")),
    ).toBe(false);
  });

  it("끄는 규칙은 제안에서 빠지고, 깨끗한 문장은 제안이 없다", () => {
    expect(
      suggestWritingPolishForText(synopsis("그는 다시 또 문을 열었다."), { disabledRules: ["redundant-pair"] }),
    ).toHaveLength(0);
    expect(suggestWritingPolishForText(synopsis("그는 문을 열었다. 바람이 불었다."))).toHaveLength(0);
  });

  it("제안 id 는 원문이 같으면 안정적이다(무시 상태 유지 근거)", () => {
    const a = suggestWritingPolishForText(synopsis("그는 다시 또 문을 열었다."));
    const b = suggestWritingPolishForText(synopsis("그는 다시 또 문을 열었다."));
    expect(a[0]?.id).toBe(b[0]?.id);
  });
});

describe("적용", () => {
  it("제안 1개 적용은 그 문장만 바꾸고 나머지는 보존한다", () => {
    const doc = synopsis("그는 다시 또 문을 열었다. 바람이 불었다.");
    const [s] = suggestWritingPolishForText(doc);
    expect(applyWritingPolishSuggestion(doc.text, s!)).toBe("그는 다시 문을 열었다. 바람이 불었다.");
  });

  it("원문이 바뀐 제안은 적용하지 않고 원본 참조를 돌려준다", () => {
    const doc = synopsis("그는 다시 또 문을 열었다.");
    const [s] = suggestWritingPolishForText(doc);
    const changed = "전혀 다른 문장이다.";
    expect(applyWritingPolishSuggestion(changed, s!)).toBe(changed);
  });

  it("삭제 제안 적용 시 문장과 뒤 공백이 정리된다", () => {
    const doc = synopsis("그는 문을 열고 안으로 들어갔다. 방은 어두웠다. 그는 문을 열고 안으로 들어갔다.");
    const dup = suggestWritingPolishForText(doc).find((s) => s.ruleIds.includes("duplicate-sentence"))!;
    expect(applyWritingPolishSuggestion(doc.text, dup)).toBe("그는 문을 열고 안으로 들어갔다. 방은 어두웠다. ");
  });

  it("일괄 적용은 오프셋이 밀리지 않는다", () => {
    const doc = synopsis("그는 다시 또 문을 열었다. 문이 열리게 되어진다. 바람이 불었다.");
    const all = suggestWritingPolishForText(doc);
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(applyWritingPolishSuggestions(doc.text, all)).toBe("그는 다시 문을 열었다. 문이 열리게 된다. 바람이 불었다.");
  });
});

describe("요약·diff", () => {
  it("요약은 규칙별 건수와 축약량을 집계한다", () => {
    const docs = [synopsis("그는 다시 또 문을 열었다.")];
    const summary = summarizeWritingPolish(docs, suggestWritingPolish(docs));
    expect(summary.suggestionCount).toBe(1);
    expect(summary.byRule["redundant-pair"]).toBe(1);
    expect(summary.totalCharsSaved).toBeGreaterThan(0);
  });

  it("단어 diff 는 빠진 말과 넣은 말을 구분한다", () => {
    const segments = diffWritingWords("그는 다시 또 문을 열었다.", "그는 다시 문을 열었다.");
    expect(segments.filter((s) => s.type === "removed").map((s) => s.text).join("")).toContain("또");
    expect(segments.filter((s) => s.type === "same").map((s) => s.text).join("")).toContain("열었다");
  });
});

describe("제공자 명세", () => {
  it("로컬 제공자는 코어와 같은 제안을 낸다", async () => {
    const docs = [synopsis("그는 다시 또 문을 열었다.")];
    const outcome = await polishWithProvider(localRuleWritingPolishProvider, { documents: docs });
    expect(outcome.usedFallback).toBe(false);
    expect(outcome.suggestions).toHaveLength(1);
  });

  it("원격 제공자가 throw 하면 로컬로 폴백하고 사유를 남긴다", async () => {
    const broken: WritingPolishProvider = {
      id: "server-llm:broken",
      kind: "remote-ai",
      async suggest() {
        throw new Error("network down");
      },
    };
    const outcome = await polishWithProvider(broken, { documents: [synopsis("그는 다시 또 문을 열었다.")] });
    expect(outcome.usedFallback).toBe(true);
    expect(outcome.providerId).toBe("local-rules");
    expect(outcome.suggestions).toHaveLength(1);
  });

  it("원격 제안은 원문 구간 검증에서 걸러진다", async () => {
    const docs = [synopsis("그는 다시 또 문을 열었다.")];
    const [good] = suggestWritingPolish(docs);
    const forged: WritingPolishProvider = {
      id: "server-llm:forged",
      kind: "remote-ai",
      async suggest() {
        return [
          good!,
          { ...good!, id: "forged", start: 0, end: 3, original: "없는말" },
        ];
      },
    };
    const outcome = await polishWithProvider(forged, { documents: docs });
    expect(outcome.usedFallback).toBe(false);
    expect(outcome.suggestions).toHaveLength(1);
    expect(outcome.rejectedCount).toBe(1);
    const check = validateRemotePolishSuggestions(docs, [{ ...good!, suggested: good!.original }]);
    expect(check.rejectedCount).toBe(1);
  });

  it("원격 제안이 전부 가짜면 로컬로 폴백한다", async () => {
    const docs = [synopsis("그는 다시 또 문을 열었다.")];
    const [good] = suggestWritingPolish(docs);
    const forgedOnly: WritingPolishProvider = {
      id: "server-llm:forged-only",
      kind: "remote-ai",
      async suggest() {
        return [{ ...good!, start: 99, end: 100 }];
      },
    };
    const outcome = await polishWithProvider(forgedOnly, { documents: docs });
    expect(outcome.usedFallback).toBe(true);
    expect(outcome.suggestions).toHaveLength(1);
    expect(outcome.suggestions[0]?.ruleIds).toContain("redundant-pair");
  });
});
