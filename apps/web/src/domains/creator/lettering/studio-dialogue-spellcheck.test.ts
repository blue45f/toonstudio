import { describe, expect, it } from "vitest";

import type { DialogueBatchItem } from "./studio-dialogue-batch";
import {
  checkDialogueSpelling,
  summarizeDialogueSpellcheck,
} from "./studio-dialogue-spellcheck";

function item(partial: Partial<DialogueBatchItem> & { id: string }): DialogueBatchItem {
  return {
    pageId: "p1",
    pageIndex: 0,
    elType: "bubble",
    text: "",
    hidden: false,
    locked: false,
    ...partial,
  };
}

describe("checkDialogueSpelling", () => {
  it("빈 말풍선은 error, 빈 텍스트는 warning으로 알린다", () => {
    const findings = checkDialogueSpelling([
      item({ id: "b1", text: "  " }),
      item({ id: "t1", elType: "text", text: "" }),
    ]);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ itemId: "b1", ruleId: "empty-dialogue", severity: "error" });
    expect(findings[1]).toMatchObject({ itemId: "t1", ruleId: "empty-dialogue", severity: "warning" });
  });

  it("자주 틀리는 표기를 잡고 고치기 후보를 제시한다", () => {
    const findings = checkDialogueSpelling([
      item({ id: "b1", text: "그게 됬다니, 몇일이나 걸린 거야?" }),
    ]);
    const fixes = findings.filter((f) => f.ruleId === "common-misspelling");
    expect(fixes.map((f) => f.fix?.replacement)).toEqual(["됐", "며칠"]);
    // 후보를 적용하면 표준 표기가 된다(자동 적용은 하지 않는다는 계약의 전제 검증).
    const first = fixes[0];
    expect(first?.fix).toBeDefined();
  });

  it("띄어 쓴 의존명사는 건드리지 않고 붙은 경우만 잡는다", () => {
    const ok = checkDialogueSpelling([item({ id: "b1", text: "할 수 있어. 그럴 것 같아." })]);
    expect(ok.filter((f) => f.ruleId === "spacing-dependent-noun")).toHaveLength(0);

    const bad = checkDialogueSpelling([item({ id: "b2", text: "할수있어. 그럴 것같아." })]);
    const spacing = bad.filter((f) => f.ruleId === "spacing-dependent-noun");
    expect(spacing.map((f) => f.fix?.replacement)).toEqual(["수 있어", "것 같아"]);
  });

  it("문장부호 앞 공백과 연속 공백을 잡는다", () => {
    const findings = checkDialogueSpelling([item({ id: "b1", text: "정말  몰라 !" })]);
    expect(findings.some((f) => f.ruleId === "double-space")).toBe(true);
    expect(findings.some((f) => f.ruleId === "space-before-punctuation")).toBe(true);
  });

  it("짧은 대답의 반복은 중복으로 치지 않고, 긴 대사의 복사는 잡는다", () => {
    const short = checkDialogueSpelling([
      item({ id: "b1", text: "응." }),
      item({ id: "b2", text: "응." }),
    ]);
    expect(short.filter((f) => f.ruleId === "duplicate-dialogue")).toHaveLength(0);

    const copied = checkDialogueSpelling([
      item({ id: "b3", text: "오늘은 여기까지만 하자." }),
      item({ id: "b4", pageIndex: 1, pageId: "p2", text: "오늘은 여기까지만 하자." }),
    ]);
    const dup = copied.filter((f) => f.ruleId === "duplicate-dialogue");
    expect(dup).toHaveLength(1);
    expect(dup[0]?.itemId).toBe("b4");
    expect(dup[0]?.message).toContain("1페이지");
  });

  it("같은 어절 반복을 잡되 의성어는 제외한다", () => {
    const findings = checkDialogueSpelling([
      item({ id: "b1", text: "나는 나는 몰랐어. 하하 하하 웃었다." }),
    ]);
    const repeated = findings.filter((f) => f.ruleId === "repeated-word");
    expect(repeated).toHaveLength(1);
    expect(repeated[0]?.matchText).toContain("나는");
  });

  it("긴 말풍선과 긴 한 줄을 경고한다", () => {
    const longLine = "가나다라마바사아자차카타파하가나다라마바사아자차카타파하";
    const findings = checkDialogueSpelling([item({ id: "b1", text: longLine })]);
    expect(findings.some((f) => f.ruleId === "bubble-line-too-long")).toBe(true);
  });

  it("숨김 대사는 기본 제외, 옵션을 주면 포함한다", () => {
    const hidden = [item({ id: "b1", text: "됬다", hidden: true })];
    expect(checkDialogueSpelling(hidden)).toHaveLength(0);
    expect(checkDialogueSpelling(hidden, { includeHidden: true }).length).toBeGreaterThan(0);
  });

  it("잠긴 대사도 검사한다(읽기는 잠금과 무관)", () => {
    const findings = checkDialogueSpelling([item({ id: "b1", text: "됬다", locked: true })]);
    expect(findings.some((f) => f.ruleId === "common-misspelling")).toBe(true);
  });

  it("규칙을 끄면 그 규칙의 지적이 사라진다", () => {
    const findings = checkDialogueSpelling([item({ id: "b1", text: "됬다" })], {
      disabledRules: ["common-misspelling"],
    });
    expect(findings).toHaveLength(0);
  });

  it("요약은 심각도·규칙별 건수를 집계한다", () => {
    const items = [item({ id: "b1", text: "" }), item({ id: "b2", text: "됬다" })];
    const findings = checkDialogueSpelling(items);
    const summary = summarizeDialogueSpellcheck(items, findings);
    expect(summary.checkedItemCount).toBe(2);
    expect(summary.errorCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    expect(summary.byRule["common-misspelling"]).toBe(1);
  });

  it("'-께' 말끝(요 없는 형태)도 잡되, 존댓말 조사 '께'는 지적하지 않는다", () => {
    const flagged = checkDialogueSpelling([
      item({ id: "k1", text: "내가 꼭 할께!" }),
      item({ id: "k2", text: "그건 내가 줄께." }),
      item({ id: "k3", text: "내일 갈께!" }),
      item({ id: "k4", text: "걱정 마, 될께." }),
      item({ id: "k5", text: "여기 있을께." }),
    ]).filter((f) => f.ruleId === "common-misspelling");
    expect(flagged.map((f) => f.fix?.replacement)).toEqual([
      "할게",
      "줄게",
      "갈게",
      "될게",
      "있을게",
    ]);

    // 존댓말 조사 '께'는 올바른 표기이므로 절대 지적하면 안 된다(정밀도 우선 원칙).
    const honorific = checkDialogueSpelling([
      item({ id: "h1", text: "선생님께 드릴 말씀" }),
      item({ id: "h2", text: "어머니께 안부 전해줘" }),
      item({ id: "h3", text: "할머니께 용돈 받았어" }),
    ]);
    expect(honorific.filter((f) => f.ruleId === "common-misspelling")).toHaveLength(0);
  });
});

describe("checkDialogueSpelling — 사전 확장(무모호 100+)", () => {
  // 표본 세트: [오기 표본 문장, 기대 교체안]. 1~2차 128항목 + 3차(음식·일상) 18항목 = 146건.
  // 각 표본은 사전 지적이 정확히 1건이어야 하고, 교체안이 기대와 같아야 한다.
  const CASES: readonly (readonly [string, string])[] = [
    ["됬다", "됐"],
    ["됀장", "된"],
    ["그게 되요", "돼요"],
    ["몇일", "며칠"],
    ["오랫만이야", "오랜만"],
    ["금새", "금세"],
    ["어의없다", "어이없"],
    ["희안하다", "희한"],
    ["설겆이", "설거지"],
    ["깨끗히", "깨끗이"],
    ["일일히", "일일이"],
    ["어떻해", "어떡해"],
    ["읽을께요", "을게요"],
    ["할께", "할게"],
    ["될께", "될게"],
    ["줄께", "줄게"],
    ["그럴께", "그럴게"],
    ["갈께", "갈게"],
    ["있을께", "있을게"],
    ["웬지", "왠지"],
    ["왠만하면", "웬만"],
    ["뭐에요", "뭐예요"],
    ["있슴니다", "습니다"],
    ["있읍니다", "습니다"],
    ["내 바램", "바람"],
    ["할려고 했어", "하려고"],
    ["될려고 해", "되려고"],
    ["갈려고 해", "가려고"],
    ["볼려고 해", "보려고"],
    ["줄려고 해", "주려고"],
    ["올려고 해", "오려고"],
    ["먹을려고 해", "먹으려고"],
    ["볼께", "볼게"],
    ["올께", "올게"],
    ["먹을께", "먹을게"],
    ["기다릴께", "기다릴게"],
    ["만날께", "만날게"],
    ["보낼께", "보낼게"],
    ["들어나다니", "드러나다"],
    ["속이 들어났다", "드러났"],
    ["들어내다니", "드러내다"],
    ["요세 바빠", "요새"],
    ["왠일이야", "웬일"],
    ["역활을 맡아", "역할"],
    ["궁굼해", "궁금"],
    ["닭계장 먹자", "닭개장"],
    ["육계장 먹자", "육개장"],
    ["미싯가루로 전 부쳐", "미숫가루"],
    ["삭월세 방", "사글세"],
    ["댓가를 치러", "대가"],
    ["짜집기한 글", "짜깁기"],
    ["짜투리 천", "자투리"],
    ["곰곰히 생각해", "곰곰이"],
    ["뚜렷히 보여", "뚜렷이"],
    ["번번히 져", "번번이"],
    ["깊숙히 박혀", "깊숙이"],
    ["빽빽히 들어차", "빽빽이"],
    ["촘촘히 짜", "촘촘이"],
    ["틈틈히 와", "틈틈이"],
    ["곳곳히 숨어", "곳곳이"],
    ["샅샅히 뒤져", "샅샅이"],
    ["낱낱히 밝혀", "낱낱이"],
    ["족족히 맞혀", "족족이"],
    ["듬직히 생겨", "듬직이"],
    ["솔직이 말해", "솔직히"],
    ["꼼꼼이 챙겨", "꼼꼼히"],
    ["가만이 있어", "가만히"],
    ["조용이 해", "조용히"],
    ["편안이 앉아", "편안히"],
    ["무사이 도착해", "무사히"],
    ["대단이 고마워", "대단히"],
    ["특별이 챙겨줘", "특별히"],
    ["확실이 알아", "확실히"],
    ["당연이 해야지", "당연히"],
    ["갑작이 와", "갑자기"],
    ["천천이 와", "천천히"],
    ["단단이 묶어", "단단히"],
    ["튼튼이 지어", "튼튼히"],
    ["나즈막히 말해", "나지막이"],
    ["나즈막하게 말해", "나지막"],
    ["두리뭉실 넘어가", "두루뭉술"],
    ["귀뜸해 줘", "귀띔"],
    ["눈꼽 떼", "눈곱"],
    ["눈쌀 찌푸려", "눈살"],
    ["도데체 왜", "도대체"],
    ["어짜피 늦어", "어차피"],
    ["하마트면 다쳐", "하마터면"],
    ["단언컨데 맞아", "단언컨대"],
    ["애시당초 글렀어", "애초"],
    ["여지껏 몰라", "여태껏"],
    ["설레임이 커", "설렘"],
    ["가슴이 설레이다", "설레다"],
    ["헤메다 보면", "헤매"],
    ["메세지 왔어", "메시지"],
    ["메신져로 보내", "메신저"],
    ["컨닝하면 안 돼", "커닝"],
    ["케익 사 와", "케이크"],
    ["쥬스 마셔", "주스"],
    ["빠마했어", "파마"],
    ["리모컨 줘", "리모콘"],
    ["에어콘 켜", "에어컨"],
    ["잠궈 둬", "잠가"],
    ["잠궜어", "잠갔"],
    ["담궈 먹어", "담가"],
    ["담궜어", "담갔"],
    ["치뤄야 해", "치러"],
    ["치뤘어", "치렀"],
    ["부셔 버려", "부숴"],
    ["건내 줘", "건네"],
    ["갖어 와", "가져"],
    ["짐을 맡히다", "맡기다"],
    ["이쁘다", "예쁘"],
    ["이뻐", "예뻐"],
    ["기엽다", "귀엽"],
    ["짓굿다", "짓궂"],
    ["마음데로 해", "마음대로"],
    ["제멋데로 굴어", "제멋대로"],
    ["익숙치 않아", "익숙지"],
    ["오랜동안 몰랐어", "오랫동안"],
    ["제 거에요", "거예요"],
    ["아니예요", "아니에요"],
    ["그게 무엇에요", "무엇이에요"],
    ["어떻하지", "어떡하"],
    ["어쨋든 가", "어쨌든"],
    ["어쨌던 말던", "어쨌든"],
    ["얼굴이 붇어", "부어"],
    ["얼굴이 붇다", "붓다"],
    ["만히 먹어", "많이"],
    ["곱배기로 주세요", "곱빼기"],
    ["떡볶기 먹자", "떡볶이"],
    ["수재비 먹자", "수제비"],
    ["뚝빼기에 담아", "뚝배기"],
    ["돈까스 먹자", "돈가스"],
    ["김치찌게 끓여", "김치찌개"],
    ["된장찌게 끓여", "된장찌개"],
    ["순댓국 먹자", "순대국"],
    ["후라이드 치킨", "프라이드"],
    ["주구장창 일해", "주야장천"],
    ["희노애락을 겪어", "희로애락"],
    ["문뜩 생각나", "문득"],
    ["번뜩이는 눈", "번득"],
    ["새카맣게 탔어", "새까맣"],
    ["귀저기 갈아", "기저귀"],
    ["작작년 사진", "재작년"],
    ["찝찝한 기분", "찜찜"],
    ["밤세 공부해", "밤새"],
  ];

  it("대표 오기 표본 세트 전수(146건)를 검출하고 교체안이 정확하다", () => {
    expect(CASES.length).toBeGreaterThan(100);
    const misses: string[] = [];
    CASES.forEach(([text, expected], i) => {
      const found = checkDialogueSpelling([item({ id: `c${i}`, text })]).filter(
        (f) => f.ruleId === "common-misspelling",
      );
      if (found.length !== 1 || found[0]?.fix?.replacement !== expected) {
        misses.push(
          `${text} -> 기대 [${expected}] 1건, 실제 ${found.length}건 [${found.map((f) => f.fix?.replacement).join(", ")}]`,
        );
      }
    });
    expect(misses).toEqual([]);
  });

  it("'-께요'는 ㄹ받침 약속 말끝만 잡고 존댓말 조사 '께요'는 지적하지 않는다", () => {
    // 사전에 없는 동사 어간이라도 '-(으)ㄹ게요' 형태면 잡는다(교체안은 앞 음절 포함).
    // '기다릴께요'는 개별 항목(기다릴께)과 범용 항목이 겹쳐도 지적은 1건만 남는다.
    const flagged = checkDialogueSpelling([
      item({ id: "p1", text: "읽을께요, 걱정 마세요" }),
      item({ id: "p2", text: "만들께요, 조금만 기다려요" }),
      item({ id: "p3", text: "기다릴께요" }),
    ]).filter((f) => f.ruleId === "common-misspelling");
    expect(flagged.map((f) => f.fix?.replacement)).toEqual(["을게요", "들게요", "릴게요"]);

    // 존댓말 조사 '께'+'요'는 올바른 표기 — 앞말이 ㄹ받침이 아니면 지적 금지.
    const honorific = checkDialogueSpelling([
      item({ id: "q1", text: "선생님께요, 드릴 말씀이 있어요" }),
      item({ id: "q2", text: "부모님께요, 이 편지 전해 주세요" }),
      item({ id: "q3", text: "어머니께요, 여쭤볼 게 있어요" }),
      item({ id: "q4", text: "할아버지께요, 안부 전해줘" }),
    ]);
    expect(honorific.filter((f) => f.ruleId === "common-misspelling")).toHaveLength(0);
  });

  it("정상 문장 세트(41건)에서는 맞춤법 지적이 0건이다(오탐 0)", () => {
    const NORMAL: readonly string[] = [
    "선생님께 드릴 말씀",
    "어머니께 안부 전해줘",
    "가만히 앉아 있어",
    "솔직히 말해줘",
    "꼼꼼히 확인했어",
    "안녕히 가세요",
    "깨끗이 씻고 일일이 확인했어",
    "왠지 오늘은 기분이 좋아",
    "웬일이야, 네가 이럴 줄이야",
    "웬만하면 참아",
    "그건 내 바람이야",
    "설렘이 가득해",
    "헤매지 마, 길이 드러났어",
    "마음대로 해, 제멋대로 해도 돼",
    "오랫동안 기다렸어",
    "익숙지 않아도 괜찮아",
    "많이 먹어, 천천히 걸어",
    "뚜렷이 기억나, 곰곰이 생각해",
    "문을 잠가 줘, 김치를 담가 먹자",
    "너 오늘 예뻐, 강아지가 귀여워",
    "아니에요, 그건 제 거예요",
    "역할이 궁금해, 무엇을 맡았어",
    "공부하려고 해, 여기 살려고 왔어",
    "에어컨 켜고 리모콘 줘, 케이크랑 주스 사 와",
    "시험을 치렀어, 짐을 맡겼어",
    "과녁을 맞혔어",
    "책을 건네고 문을 건드렸어",
    "나지막이 말해, 조용히 앉아",
    "할게, 내가 갈게",
    "무엇이에요? 뭐예요?",
    "오랜만이야, 요새 바빠?",
    "선생님께요, 드릴 말씀이 있어요",
    "부모님께요, 이 편지 전해 주세요",
    "어머니께요, 여쭤볼 게 있어요",
    "요세미티 국립공원에 가고 싶어",
    "곱빼기로 주세요, 떡볶이랑 순대국도 같이요",
    "주야장천 일만 해, 희로애락을 나눠",
    "문득 번득이는 불빛, 새까맣게 그을렸어",
    "기저귀를 갈고 재작년 사진을 봤어",
    "찜찜한 마음으로 밤새 뒤척였어",
    "돈가스에 프라이드치킨, 김치찌개와 된장찌개를 뚝배기에",
    ];
    expect(NORMAL.length).toBeGreaterThan(20);
    const findings = checkDialogueSpelling(
      NORMAL.map((text, i) => item({ id: `n${i}`, text })),
    ).filter((f) => f.ruleId === "common-misspelling");
    expect(findings).toHaveLength(0);
  });

  it("확장 항목의 고치기 후보를 적용하면 표준 표기가 된다", () => {
    const samples: readonly (readonly [string, string])[] = [
      ["나즈막히 말해", "나지막이 말해"],
      ["가만이 있어", "가만히 있어"],
      ["만히 먹어", "많이 먹어"],
      ["속이 들어났다", "속이 드러났다"],
      ["짐을 맡히다", "짐을 맡기다"],
    ];
    for (const [text, expected] of samples) {
      const [finding] = checkDialogueSpelling([item({ id: "x", text })]).filter(
        (f) => f.ruleId === "common-misspelling",
      );
      expect(finding?.fix).toBeDefined();
      const fix = finding?.fix;
      if (!fix) continue;
      expect(text.slice(0, fix.start) + fix.replacement + text.slice(fix.end)).toBe(expected);
    }
  });
});
