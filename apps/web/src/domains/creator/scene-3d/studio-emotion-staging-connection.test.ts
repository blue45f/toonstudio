import { describe, expect, it } from "vitest";

import type { DialogueEmotionKind } from "../ai/studio-ai-emotion-staging-matcher";
import type { PoseCatalogEntry } from "./studio-pose-suggestion";
import { connectEmotionToStaging } from "./studio-emotion-staging-connection";

/**
 * 정본 표정 프리셋 id 집합 — main의 studio-pose-presets.ts EXPRESSION_PRESETS에서
 * 실측한 값 (28종). 연결 모듈이 실재하지 않는 표정을 내면 이 테스트가 실패한다.
 */
const REAL_EXPRESSION_IDS = new Set([
  "xf_joy", "xf_grin", "xf_sad", "xf_tears", "xf_angry", "xf_grudge",
  "xf_surprised", "xf_blank", "xf_shy", "xf_wink", "xf_sleepy", "xf_neutral",
  "xf_determined", "xf_pout", "xf_smirk", "xf_awe", "xf_evil", "xf_cry_laugh",
  "xf_confused", "xf_love", "xf_scream", "xf_cool", "xf_focus", "xf_yawn",
  "xf_sassy", "xf_innocent", "xf_serious", "xf_excited",
]);

/**
 * 포즈 카탈로그 fixture — main의 studio-3d-advanced-poses-library
 * ADVANCED_WEBTOON_POSES 12종의 메타데이터(id·이름·카테고리·성별·인원·태그·설명)를
 * 실측해 옮긴 값. jointRotations만 추천과 무관해 생략했다.
 */
const REAL_CATALOG: readonly PoseCatalogEntry[] = [
  { id: "action-hero-landing", name: "히어로 3점 착지 (Superhero Landing)", category: "action", gender: "any", figures: 1, tags: ["히어로", "착지", "전투", "클라이맥스", "슈퍼히어로"], description: "한 손과 무릎을 바닥에 짚으며 착지하는 강렬한 클라이맥스 포즈" },
  { id: "action-sword-slash", name: "일도양단 발도세 (Sword Draw Slash)", category: "action", gender: "any", figures: 1, tags: ["검", "발도", "베기", "무사", "전투", "무협"], description: "검을 대각선으로 크게 휘두르는 역동적인 액션 동작" },
  { id: "action-dynamic-jump-kick", name: "공중 도약 하이킥 (Flying Jump Kick)", category: "action", gender: "any", figures: 1, tags: ["발차기", "점프", "공중", "격투", "킥"], description: "공중에서 몸을 비틀며 날리는 호쾌한 발차기" },
  { id: "action-magic-burst", name: "양손 마력 집중 (Magic Invocation)", category: "action", gender: "any", figures: 1, tags: ["마법", "영창", "양손", "판타지", "결계"], description: "양손을 전방으로 뻗으며 결계를 치거나 마법을 영창하는 포즈" },
  { id: "daily-standing-casual", name: "주머니 손 넣고 대기 (Hands in Pockets)", category: "daily", gender: "any", figures: 1, tags: ["서있기", "대기", "주머니", "일상", "짝다리"], description: "짝다리를 짚고 자연스럽게 서 있는 일상적인 전신 포즈" },
  { id: "daily-sitting-chair", name: "의자에 턱 괴고 앉기 (Chin on Hand)", category: "daily", gender: "any", figures: 1, tags: ["앉기", "의자", "카페", "생각", "휴식"], description: "책상/카페 의자에 앉아 한 손으로 턱을 괸 채 생각에 잠긴 자세" },
  { id: "daily-phone-call", name: "스마트폰 통화하며 걷기 (Phone Walk)", category: "daily", gender: "any", figures: 1, tags: ["전화", "걷기", "스마트폰", "통화", "일상"], description: "한 손으로 전화를 귀에 대고 걸어가는 포즈" },
  { id: "daily-coffee-sip", name: "머그잔 마시기 (Coffee Sip)", category: "daily", gender: "any", figures: 1, tags: ["커피", "차", "마시기", "휴식", "머그잔"], description: "양손으로 따뜻한 찻잔을 들고 마시는 차분한 일상 자세" },
  { id: "dramatic-shock-stepback", name: "경악하며 뒷걸음질 (Shock & Recoil)", category: "dramatic", gender: "any", figures: 1, tags: ["놀람", "충격", "뒷걸음", "반전", "경악"], description: "충격적인 진실을 마주하고 몸을 뒤로 빼며 놀라는 드라마틱 컷" },
  { id: "dramatic-kneeling-despair", name: "무릎 꿇고 절망 (Kneeling Despair)", category: "emotion", gender: "any", figures: 1, tags: ["절망", "무릎", "좌절", "슬픔", "고개숙임"], description: "무릎을 꿇고 고개를 떨군 채 좌절하는 감정 씬" },
  { id: "dramatic-romantic-hug", name: "로맨스 포옹 (Romantic Embrace)", category: "emotion", gender: "any", figures: 2, tags: ["포옹", "로맨스", "연인", "하이라이트", "끌어안기"], description: "상대방을 다정하게 끌어안는 웹툰 로맨스 하이라이트 자세" },
  { id: "dramatic-wall-slam-kabe-don", name: "벽치기 카베동 (Kabe-Don)", category: "dramatic", gender: "any", figures: 2, tags: ["벽치기", "카베동", "설렘", "로맨스", "클리셰"], description: "한 손으로 벽을 짚고 상대를 응시하는 설레는 클리셰 연출" },
];

const ALL_KINDS: DialogueEmotionKind[] = [
  "joy", "love", "shame", "anger", "sorrow",
  "fear", "surprise", "determination", "confusion", "neutral",
];

function detailFor(kind: DialogueEmotionKind, intensity = 0.5) {
  return {
    kind,
    intensity,
    confidence: 0.7,
    matchedTerms: ["근거"] as readonly string[],
  };
}

describe("감정→표정 매핑 연결", () => {
  it("전 감정의 표정 추천이 정본 id 집합 안에 있고 1순위는 대표 표정이다", () => {
    for (const kind of ALL_KINDS) {
      const result = connectEmotionToStaging({
        detail: detailFor(kind),
        catalog: REAL_CATALOG,
      });
      expect(result.expressions).toHaveLength(3);
      expect(result.expressions[0].rank).toBe(1);
      expect(result.expressions[0].reason).toBe("emotion-primary");
      for (const expression of result.expressions) {
        expect(REAL_EXPRESSION_IDS.has(expression.presetId)).toBe(true);
      }
      expect(result.rationale.length).toBeGreaterThan(0);
    }
  });

  it("강한 감정에서는 더 강한 표정 변형이 intensity-boosted로 1순위에 오른다", () => {
    const result = connectEmotionToStaging({
      text: "화나! 짜증나! 열받네! 그만해!",
      catalog: REAL_CATALOG,
    });
    expect(result.detail.kind).toBe("anger");
    expect(result.detail.intensity).toBeGreaterThanOrEqual(0.8);
    expect(result.expressions[0].presetId).toBe("xf_scream");
    expect(result.expressions[0].reason).toBe("intensity-boosted");
  });
});

describe("같은 판정이 포즈 추천까지 몬다", () => {
  it("분노 대사는 rage-shout으로 브리지돼 감정 친화 포즈가 emotion-match로 뜬다", () => {
    const result = connectEmotionToStaging({
      text: "너 때문에 다 망쳤어. 화나 죽겠어!",
      catalog: REAL_CATALOG,
    });
    expect(result.speechEmotion).toBe("rage-shout");
    expect(result.poses.length).toBeGreaterThan(0);
    expect(result.poses[0].reasons).toContain("emotion-match");
    expect([
      "action-sword-slash",
      "action-dynamic-jump-kick",
      "action-magic-burst",
    ]).toContain(result.poses[0].presetId);
  });

  it("설렘 대사 + 2인 조건에서는 포옹·벽치기가 감정 근거로 제안된다", () => {
    const result = connectEmotionToStaging({
      text: "보고 싶었어. 너무 소중해",
      catalog: REAL_CATALOG,
      figures: 2,
    });
    expect(result.speechEmotion).toBe("romance-blush");
    expect(result.poses.length).toBeGreaterThan(0);
    for (const pose of result.poses) {
      expect(["dramatic-romantic-hug", "dramatic-wall-slam-kabe-don"]).toContain(
        pose.presetId,
      );
    }
  });

  it("인원 조건에 맞는 포즈가 없으면 포즈만 비고 표정은 남는다", () => {
    const oneFigureOnly = REAL_CATALOG.filter((entry) => entry.figures === 1);
    // 약한 기쁨(강도 0.6) — 강한 기쁨이면 xf_excited가 부스트되어 1순위가 된다.
    const result = connectEmotionToStaging({
      text: "오늘은 기뻐",
      catalog: oneFigureOnly,
      figures: 2,
    });
    expect(result.poses).toHaveLength(0);
    expect(result.expressions[0].presetId).toBe("xf_joy");
  });
});

describe("정직한 판정과 결정성", () => {
  it("근거 없는 대사는 evidenceWeak로 밝히고 담담한 연출을 제안한다", () => {
    const result = connectEmotionToStaging({
      text: "내일 회의는 세 시에 시작합니다.",
      catalog: REAL_CATALOG,
    });
    expect(result.detail.kind).toBe("neutral");
    expect(result.evidenceWeak).toBe(true);
    expect(result.expressions[0].presetId).toBe("xf_neutral");
    expect(result.speechEmotion).toBe("neutral-calm");
  });

  it("같은 입력은 같은 연결 결과를 낸다", () => {
    const input = {
      text: "헐, 진짜야? 말도 안 돼",
      catalog: REAL_CATALOG,
    };
    expect(connectEmotionToStaging(input)).toEqual(
      connectEmotionToStaging(input),
    );
  });
});
