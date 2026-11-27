import { buildLocalColorMood } from "@toonstudio/studio-project-model/character-art-style";
import type {
  OpenAiAssistStructuredResult,
  StudioOpenAiAssistMode,
  StudioOpenAiCreativeAssistRequest,
} from "../studio-openai-creative-assist.dto";
import { buildLocalDialogueLayout, buildLocalScriptCuts } from "./studio-assist-local-script";

function compactSnippet(input: string, maxLen = 64): string {
  const cleaned = input.replace(/\s+/gu, " ").trim();
  if (!cleaned) return "장면 초안";
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1).replace(/[\uD800-\uDBFF]$/u, "")}…` : cleaned;
}

/**
 * 모든 외부 무료 AI 공급자가 미설정이거나 일일 안전 한도(90%)·429/402 차단 상태일 때
 * 과금 ₩0으로 14종 웹툰 AI 보조 모드의 스키마 검증을 통과하는 결정론적 로컬 코치 결과를 만든다.
 */
export function buildDeterministicAssistResult(
  mode: StudioOpenAiAssistMode,
  input: Pick<StudioOpenAiCreativeAssistRequest, "inputText" | "projectTitle" | "genreOrTone">,
): OpenAiAssistStructuredResult {
  const title = input.projectTitle?.trim() || "현재 원고";
  const tone = input.genreOrTone?.trim() || "드라마·웹툰";
  const snippet = compactSnippet(input.inputText, 72);

  switch (mode) {
    case "idea-remix":
      return {
        mode,
        data: {
          summary: `[로컬 무과금 코치 · ₩0] '${title}' 소재("${snippet}")를 5가지 연출 각도로 확장했습니다.`,
          angles: [
            {
              lens: "contrarian",
              lensLabelKo: "통념 뒤집기",
              headline: "기대한 조력자가 사실 사건의 시작점이라면",
              pitch: `"${snippet}" 상황에서 가장 안전해 보이는 인물의 선택이 갈등을 키우도록 시점을 뒤집어 보세요.`,
              firstCutHint: "클로즈업으로 손동작만 먼저 보여 주고 인물의 얼굴은 2컷으로 미룹니다.",
            },
            {
              lens: "personal-hook",
              lensLabelKo: "현실 공감 훅",
              headline: "누구나 겪은 사소한 머뭇거림에서 시작하기",
              pitch: `${tone} 분위기 속에 일상적 망설임과 시선 회피 디테일을 넣어 첫 스크롤 이탈을 줄이세요.`,
              firstCutHint: "모바일 첫 화면에 짧은 독백 한 줄과 여백 220px를 배치합니다.",
            },
            {
              lens: "detail-evidence",
              lensLabelKo: "디테일 증거",
              headline: "소품 하나가 대사 열 줄을 대신한다",
              pitch: "인물의 감정 변화를 직접 설명하지 말고 손에 쥔 소품의 흠집·온기 변화로 보여 주세요.",
              firstCutHint: "인서트 컷으로 핵심 소품을 화면 중앙에 크게 잡습니다.",
            },
            {
              lens: "four-cut-playbook",
              lensLabelKo: "4컷 전개 구성",
              headline: "기-승-전-클리프행어 4박자 압축",
              pitch: "1컷 상황 제시 → 2컷 작은 이상 징후 → 3컷 감정 반응 → 4컷 다음 화 질문으로 끝맺으세요.",
              firstCutHint: "4컷 하단에 다음 회차로 이어지는 반전 말풍선 1개만 남깁니다.",
            },
            {
              lens: "missed-angle",
              lensLabelKo: "빈틈 시선",
              headline: "주인공이 아닌 관찰자의 시선으로 열기",
              pitch: "배경 인물이나 CCTV·유리창 반사 시점을 빌리면 같은 사건도 훨씬 입체적으로 보입니다.",
              firstCutHint: "하이 앵글 롱샷으로 공간 전체의 거리감을 먼저 각인합니다.",
            },
          ],
        },
      };

    case "script-to-cuts":
      return { mode, data: buildLocalScriptCuts(input.inputText, title) };

    case "dialogue-polish":
      return { mode, data: buildLocalDialogueLayout(input.inputText) };

    case "export-preflight-coach":
      return {
        mode,
        data: {
          readinessSummary: `'${title}' 원고 메모로 만든 출고 체크리스트입니다. 최종 원고 이미지와 에셋 사용 허가 자료를 열어 아래 항목을 확인하세요.`,
          episodeBlurbSuggestion: `${title} — ${compactSnippet(input.inputText, 48)}`,
          checks: [
            {
              category: "말풍선 가독성",
              severity: "tip",
              detail: "배포할 화면 폭으로 원고를 열어 말풍선 안에서 글자가 겹치거나 대사가 잘리는 곳이 있는지 확인하세요.",
            },
            {
              category: "스크롤 호흡",
              severity: "tip",
              detail: "휴대전화로 회차를 스크롤하며 장면 전환이 보이는지, 엔딩 대사 전에 반응 컷을 읽을 시간이 있는지 확인하세요.",
            },
            {
              category: "권리·에셋 BOM",
              severity: "tip",
              detail: "사용한 3D 배경·폰트·브러시 목록을 각 라이선스와 대조해 상업 이용 조건과 출처 표시 의무를 확인하세요.",
            },
          ],
        },
      };

    case "character-bible-forge": {
      const statedName = input.inputText.match(/^(?:캐릭터명|캐릭터 이름|이름)[ \t]*[:：][ \t]*([^\n\r,|;]+)/mu)?.[1]?.trim();
      return {
        mode,
        data: {
          characterName: compactSnippet(statedName || "미정", 100),
          archetypeKo: `${tone} 중심의 입체적 주연`,
          speechTone: "평소에는 짧고 담백한 구어체를 쓰되, 핵심 가치관이 흔들릴 때 반말·단정형으로 톤이 바뀝니다.",
          appearancePalette: "어두운 코트 계열 메인 컬러 + 시선을 잡는 포인트 악세서리 1종(실루엣 식별용).",
          coreMotivation: `"${snippet}" 사건을 계기로 과거의 선택을 바로잡고 소중한 대상을 지키려 합니다.`,
          forbiddenLines: [
            "감정을 장황하게 스스로 해설하는 설명투 대사",
            "위기 상황에서 근거 없이 즉시 포기하는 대사",
          ],
          relationshipHooks: [
            { target: "조력자/라이벌", dynamic: "목표는 같지만 수단이 달라 매 화 작은 충돌을 만듭니다." },
            { target: "과거 인물", dynamic: "언급만으로 표정이 굳는 미해결 약속이 남아 있습니다." },
          ],
          visualConsistencyCue: "좌우 비대칭 앞머리·소매 접힘·특정 소품 위치를 모든 컷의 고정 앵커로 유지하세요.",
        },
      };
    }

    case "continuity-plot-audit":
      return {
        mode,
        data: {
          overallConsistencyScore: 84,
          summary: `'${title}'의 컷을 비교할 때 쓸 연속성 점검표입니다. 점수는 템플릿 예시값입니다.`,
          issues: [
            {
              severity: "tip",
              category: "시간·조명 연속성",
              locationHint: "장면 전환 컷",
              conflictDetail: "실내/실외 전환 시 시간대(노을·야간)와 그림자 방향이 모호해질 수 있습니다.",
              fixSuggestion: "전환 직전 창밖 빛 또는 시계 인서트 1컷을 넣어 시간 경과를 명확히 하세요.",
            },
            {
              severity: "tip",
              category: "소품·복장 일관성",
              locationHint: "클로즈업 컷",
              conflictDetail: "손에 쥔 소품의 좌우 방향이 컷 전환에서 뒤바뀌기 쉽습니다.",
              fixSuggestion: "캐릭터 바이블 체크리스트에 주 사용 손과 소품 위치를 고정 표기하세요.",
            },
          ],
        },
      };

    case "bg3d-camera-blocking":
      return {
        mode,
        data: {
          sceneSummary: `'${title}' 장면("${snippet}")용 3D 배경 카메라·조명 블로킹 JSON입니다.`,
          camera: {
            lensMm: 35,
            fovDeg: 54.4,
            angleLabel: "아이레벨 약로우 3/4 구도",
            position: [2.4, 1.45, 4.2],
            target: [0, 1.35, 0],
            rollDeg: 0,
          },
          lighting: {
            timeOfDay: "늦은 오후 골든아워",
            keyLightColor: "oklch(0.88 0.09 68)",
            rimLightNote: "인물 어깨 뒤편 45도 역광으로 배경과 실루엣을 분리하세요.",
            ambientRatio: 0.32,
          },
          propsToPlace: ["전경 프레임용 문틀/난간", "중경 핵심 상호작용 소품", "원경 깊이감 실루엣 건물"],
          blockingNotes: [
            "캐릭터 발바닥은 Z=0(Blender) / Y=0(glTF) 바닥면에 정확히 접지하세요.",
            "35mm 렌즈로 인물과 배경의 공간감을 동시에 유지하면서 말풍선 상단 여백 28%를 비워 두세요.",
          ],
        },
      };

    case "color-mood-director":
      return { mode, data: buildLocalColorMood(input.inputText) };

    case "sfx-onomatopoeia-lab":
      return {
        mode,
        data: {
          sceneEnergy: `${tone} 장면의 긴장·움직임을 살리는 한·일·영 효과음 매핑`,
          suggestions: [
            {
              ko: "탁—!",
              ja: "タンッ！",
              en: "SNAP!",
              intent: "시선이 멈추는 순간적인 동작·결단 강조",
              typographyTip: "굵은 고딕 계열에 12도 우측 기울기, 외곽선 2px",
              placementHint: "동작선 끝점과 말풍선 사이 빈 여백에 대각선 배치",
            },
            {
              ko: "두근… 두근…",
              ja: "ドキッ…ドキッ…",
              en: "BA-DUMP…",
              intent: "정적 속 심리적 압박과 심장 박동 전달",
              typographyTip: "명조 계열 자간 넓힘, 뒤쪽 글자일수록 투명도 75% → 45%",
              placementHint: "클로즈업 컷 하단 여백에 세로 리듬으로 배치",
            },
            {
              ko: "스르륵—",
              ja: "スッ…",
              en: "SHHHH—",
              intent: "문·커튼·그림자가 조용히 움직이는 전환 효과",
              typographyTip: "얇은 브러시 필기체, 끝 획을 길게 늘여 방향성 표현",
              placementHint: "피사체 이동 궤적을 따라 부드럽게 곡선 배치",
            },
          ],
        },
      };

    case "photoshop-fx-recipe":
      return {
        mode,
        data: {
          lookNameKo: "웹툰 시네마틱 림라이트 · 비파괴 마감 레시피",
          summary: `"${snippet}" 컷의 인물을 배경에서 또렷하게 띄우는 비파괴 레이어 FX 및 ACR 수치입니다.`,
          layerStyles: [
            { effect: "Outer Glow (외곽 광선)", blendMode: "screen", opacityPct: 38, paramsSummary: "크기 18px · 스프레드 8% · 따뜻한 키 라이트 톤" },
            { effect: "Gradient Overlay (분위기 그라데이션)", blendMode: "soft-light", opacityPct: 24, paramsSummary: "상단 쿨톤 → 하단 웜톤 110도 각도" },
            { effect: "Drop Shadow (깊이 그림자)", blendMode: "multiply", opacityPct: 28, paramsSummary: "거리 10px · 크기 22px · 채도 낮은 네이비 섀도" },
          ],
          cameraRaw: {
            exposure: 0.15,
            contrast: 12,
            clarity: 14,
            dehaze: 8,
            temperatureShift: 6,
            grainPct: 9,
          },
          nonDestructiveTip: "모든 효과는 스마트 오브젝트와 별도 조정 레이어 그룹에 묶어 수정 시 선화 원본을 훼손하지 마세요.",
        },
      };

    case "scroll-pacing-auditor":
      return {
        mode,
        data: {
          rhythmVerdict: "컷 사이의 여백을 바꿔 보며 읽는 속도를 비교할 수 있는 구성 예시입니다. 여백과 엔딩 점수는 템플릿 예시값입니다.",
          averageGapPx: 260,
          cliffhangerScore: 82,
          cliffhangerTip: "마지막 컷 직전 400px 이상의 백색/암전 여백을 두어 엔딩 대사의 충격을 극대화하세요.",
          beatPacing: [
            { section: "도입 훅 (1~5컷)", pacing: "tight", recommendedGapPx: 160, readerRetentionNote: "3초 안에 사건 질문을 던져 첫 스크롤 이탈을 막으세요." },
            { section: "갈등 전개 (중반)", pacing: "steady", recommendedGapPx: 240, readerRetentionNote: "대사 컷과 무대사 반응 컷을 번갈아 배치해 피로를 줄이세요." },
            { section: "절정·엔딩 훅", pacing: "drop", recommendedGapPx: 420, readerRetentionNote: "세로 낙하 여백 후 클로즈업 1컷으로 다음 화 클릭을 유도하세요." },
          ],
        },
      };

    case "thumbnail-hook-optimizer":
      return {
        mode,
        data: {
          hookDiagnosis: "대표 썸네일은 작은 모바일 카드(160px 폭)에서도 표정과 대비가 1초 안에 읽혀야 합니다.",
          titleVariants: [
            { variantLabel: "A안 · 호기심 질문형", title: `${title}: 그날 아무도 말하지 않은 비밀`, subCopy: "단 한 컷이 바꾼 관계의 균열", hookReason: "미해결 질문으로 회차 클릭률을 높입니다." },
            { variantLabel: "B안 · 감정 직구형", title: "이 선택만은 되돌릴 수 없었다", subCopy: "가장 믿었던 순간에 시작된 반전", hookReason: "갈등의 대가를 전면에 드러내 즉시 몰입시킵니다." },
            { variantLabel: "C안 · 키워드 선명형", title: `${compactSnippet(input.inputText, 22)}`, subCopy: `${tone} 핵심 전개 본격 돌입`, hookReason: "장르 독자가 찾는 핵심 키워드를 바로 노출합니다." },
          ],
          thumbnailSpec: {
            focalSubject: "주인공 눈빛 클로즈업(화면 55% 점유) + 배경 대비 실루엣",
            contrastNote: "인물 림라이트를 밝게 세우고 배경 채도를 25% 낮춰 썸네일 주목도를 높이세요.",
            textOverlayMaxChars: 8,
            cropSafetyTip: "정사각(1:1)과 가로(16:9) 크롭 모두에서 눈과 제목이 잘리지 않도록 중앙 70% 안전 영역을 지키세요.",
          },
        },
      };

    case "localization-glossary-check":
      return {
        mode,
        data: {
          targetLocales: ["en", "ja", "zh-TW"],
          glossary: [
            { termKo: title, en: `${title} (Title Case 고정)`, ja: `${title}（固定表記）`, ruleNote: "회차 전체에서 대소문자·가타카나 표기를 통일하세요." },
            { termKo: "선배 / 형·누나 호칭", en: "이름 직접 호명 또는 문맥 호칭", ja: "先輩 / 兄さん・姉さん", ruleNote: "영어권에서는 어색한 직역 대신 말투와 문맥으로 친밀도를 표현하세요." },
            { termKo: "고유 스킬·세계관 용어", en: "고유명사 음차 + 짧은 의미 통일", ja: "ルビ(후리가나) 병기 검토", ruleNote: "첫 등장 회차에 용어집 등록 후 후속 회차 자동 검수를 돌리세요." },
          ],
          culturalNotes: [
            { severity: "warn", topic: "세로/가로 말풍선 공간 차이", adaptationTip: "영어 번역은 한국어보다 폭이 25~35% 넓어지므로 말풍선 여유 패딩을 미리 확보하세요." },
            { severity: "info", topic: "의성어·효과음 식자", adaptationTip: "배경 위에 직접 그려진 효과음은 텍스트 레이어를 분리해 두면 다국어 식자 비용이 크게 줄어듭니다." },
          ],
        },
      };

    case "mcp-workflow-macro":
      return {
        mode,
        data: {
          macroTitle: `${title} 무과금 풀스튜디오 MCP 자동화 매크로`,
          summary: `"${snippet}" 작업을 ToonStudio MCP 32종 툴 체인으로 안전하게 자동 실행합니다(유료 과금 ₩0).`,
          zeroCostSafe: true,
          steps: [
            {
              stepOrder: 1,
              toolName: "studio.canvas.create",
              reasonKo: "표준 세로 웹툰 규격(800×1280)의 작업 캔버스를 초기화합니다.",
              argumentsJson: JSON.stringify({ title, width: 800, height: 1280 }),
            },
            {
              stepOrder: 2,
              toolName: "studio.bg3d.compose_scene",
              reasonKo: "장면 분위기에 맞는 3D 카메라 구도와 조명을 세팅합니다.",
              argumentsJson: JSON.stringify({ sceneName: title, lensMm: 35, timeOfDay: "golden-hour" }),
            },
            {
              stepOrder: 3,
              toolName: "studio.photoshop.apply_layer_fx",
              reasonKo: "비파괴 림라이트·외곽광선 효과 레이어를 적용합니다.",
              argumentsJson: JSON.stringify({ effect: "outer-glow", blendMode: "screen", opacityPct: 38 }),
            },
            {
              stepOrder: 4,
              toolName: "studio.export.preflight_check",
              reasonKo: "내보내기 전 해상도·말풍선 여백·Rights BOM을 최종 검증합니다.",
              argumentsJson: JSON.stringify({ platform: "naver-webtoon", requireCleanRightsBom: true }),
            },
          ],
        },
      };
  }
}
