import type { ExtendedAssistMode } from "@toonstudio/contracts/studio-openai-assist-result";

const SCROLL_GAP_PX_BOUNDS = { type: "integer", minimum: 16, maximum: 1600 } as const;

export const EXTENDED_MODE_JSON_SCHEMAS: Readonly<
  Record<ExtendedAssistMode, { readonly name: string; readonly schema: Record<string, unknown> }>
> = Object.freeze({
  "character-bible-forge": {
    name: "toonstudio_character_bible",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "characterName",
        "archetypeKo",
        "speechTone",
        "appearancePalette",
        "coreMotivation",
        "forbiddenLines",
        "relationshipHooks",
        "visualConsistencyCue",
      ],
      properties: {
        characterName: { type: "string", description: "캐릭터 이름(단서 없으면 '미정', 최대 100자)" },
        archetypeKo: { type: "string", description: "캐릭터 원형·역할(단서 없으면 '미정', 최대 140자)" },
        speechTone: { type: "string", description: "말투 습관과 어미 특징(최대 360자)" },
        appearancePalette: { type: "string", description: "외형 배색·실루엣 포인트(최대 360자)" },
        coreMotivation: { type: "string", description: "핵심 욕망·결핍·동기(최대 400자)" },
        forbiddenLines: {
          type: "array",
          description: "캐릭터가 절대 하지 않을 금기 대사(평소 2~6개, 0~8개 이내; 단서 없거나 거절 시 빈 배열 [], 항목당 최대 220자)",
          items: { type: "string" },
        },
        relationshipHooks: {
          type: "array",
          description: "인물 관계 갈등 훅(평소 1~5개, 0~8개 이내; 단서 없거나 거절 시 빈 배열 [])",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["target", "dynamic"],
            properties: {
              target: { type: "string", description: "상대 인물명·역할(최대 80자)" },
              dynamic: { type: "string", description: "관계 갈등·역학 설명(최대 340자)" },
            },
          },
        },
        visualConsistencyCue: { type: "string", description: "모든 컷에서 고정할 작화 앵커(최대 360자)" },
      },
    },
  },
  "continuity-plot-audit": {
    name: "toonstudio_continuity_audit",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["overallConsistencyScore", "summary", "issues"],
      properties: {
        overallConsistencyScore: { type: "integer", description: "전체 연속성 점수(0~100 정수)" },
        summary: { type: "string", description: "연속성·개연성 종합 요약(최대 480자)" },
        issues: {
          type: "array",
          description: "발견된 설정·연속성 이슈 목록(핵심 1~6개, 0~12개 이내; 원고가 없거나 안전 거절·오류 없음 시 빈 배열 [])",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["severity", "category", "locationHint", "conflictDetail", "fixSuggestion"],
            properties: {
              severity: { type: "string", enum: ["critical", "warn", "tip"] },
              category: { type: "string", description: "이슈 분류(최대 100자)" },
              locationHint: { type: "string", description: "해당 컷·장면 위치(최대 180자)" },
              conflictDetail: { type: "string", description: "충돌·모순 내용(최대 420자)" },
              fixSuggestion: { type: "string", description: "구체적 수정 제안(최대 420자)" },
            },
          },
        },
      },
    },
  },
  "bg3d-camera-blocking": {
    name: "toonstudio_bg3d_blocking",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["sceneSummary", "camera", "lighting", "propsToPlace", "blockingNotes"],
      properties: {
        sceneSummary: { type: "string", description: "3D 장면·공간 구도 요약(최대 420자)" },
        camera: {
          type: "object",
          additionalProperties: false,
          required: ["lensMm", "fovDeg", "angleLabel", "position", "target", "rollDeg"],
          properties: {
            lensMm: { type: "number", description: "렌즈 초점거리 mm(12~200)" },
            fovDeg: { type: "number", description: "수직 시야각 FOV 도(10~120)" },
            angleLabel: { type: "string", description: "카메라 앵글·구도 설명(최대 120자)" },
            position: {
              type: "array",
              description: "카메라 3D 좌표 [x, y, z] 숫자 정확히 3개",
              items: { type: "number" },
            },
            target: {
              type: "array",
              description: "카메라 주시 대상 3D 좌표 [x, y, z] 숫자 정확히 3개",
              items: { type: "number" },
            },
            rollDeg: { type: "number", description: "카메라 롤 각도(-45~45)" },
          },
        },
        lighting: {
          type: "object",
          additionalProperties: false,
          required: ["timeOfDay", "keyLightColor", "rimLightNote", "ambientRatio"],
          properties: {
            timeOfDay: { type: "string", description: "시간대·날씨(최대 80자)" },
            keyLightColor: { type: "string", description: "키 라이트 색상 표기(최대 120자)" },
            rimLightNote: { type: "string", description: "림 라이트 방향·강조 메모(최대 320자)" },
            ambientRatio: { type: "number", description: "환경광 비율(0~1 실수)" },
          },
        },
        propsToPlace: {
          type: "array",
          description: "전경·중경·원경 핵심 소품 배치 목록(권장 4~8개, 2~12개 이내, 항목당 최대 180자)",
          items: { type: "string" },
        },
        blockingNotes: {
          type: "array",
          description: "카메라·인물·조명 블로킹 메모. 원고가 지정한 전후 대상의 상대 크기, 동작 중 카메라에 보이는 면과 가림을 명시(권장 3~6개, 2~10개 이내, 항목당 최대 320자)",
          items: { type: "string" },
        },
      },
    },
  },
  "color-mood-director": {
    name: "toonstudio_color_mood",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["emotionLabel", "moodSummary", "palette", "lightingGuide", "contrastWarning"],
      properties: {
        emotionLabel: { type: "string", description: "장면 핵심 감정 라벨(최대 120자)" },
        moodSummary: { type: "string", description: "감정·배색 전략 요약(최대 420자)" },
        palette: {
          type: "array",
          description: "OKLCH 배색 팔레트(권장 3~5색, 3~8개 이내)",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["role", "nameKo", "oklch", "usageTip"],
            properties: {
              role: { type: "string", description: "색상 역할(최대 60자)" },
              nameKo: { type: "string", description: "한국어 색상명(최대 80자)" },
              oklch: { type: "string", description: "OKLCH 표기(최대 80자)" },
              usageTip: { type: "string", description: "이 색을 쓸 원고 속 대상·부위·용도, 넓게 채울 면이나 가는 획 등 적용 면적(최대 320자)" },
            },
          },
        },
        lightingGuide: { type: "string", description: "광원 방향·색온도, 빛을 모을 부위와 번짐을 멈출 경계. 맞닿는 면이 있으면 어느 쪽을 밝히고 어느 쪽을 그늘에 둘지 설명(최대 420자)" },
        contrastWarning: { type: "string", description: "축소 시 혼동할 두 대상과 명도·면적·윤곽 차이, 묻힐 때 바꿀 한 곳. 글자가 있으면 바탕과의 가독성도 점검(최대 420자)" },
      },
    },
  },
  "sfx-onomatopoeia-lab": {
    name: "toonstudio_sfx_lab",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["sceneEnergy", "suggestions"],
      properties: {
        sceneEnergy: { type: "string", description: "장면 음향·리듬 에너지 요약(최대 240자)" },
        suggestions: {
          type: "array",
          description: "한·일·영 효과음 제안 목록(권장 3~6개, 2~10개 이내)",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["ko", "ja", "en", "intent", "typographyTip", "placementHint"],
            properties: {
              ko: { type: "string", description: "한국어 효과음(최대 60자)" },
              ja: { type: "string", description: "일본어 효과음(최대 60자)" },
              en: { type: "string", description: "영어 효과음(최대 60자)" },
              intent: { type: "string", description: "연출 의도(최대 260자)" },
              typographyTip: { type: "string", description: "서체·기울기·외곽선 팁(최대 320자)" },
              placementHint: { type: "string", description: "컷 내 배치 위치(최대 280자)" },
            },
          },
        },
      },
    },
  },
  "photoshop-fx-recipe": {
    name: "toonstudio_photoshop_fx",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["lookNameKo", "summary", "layerStyles", "cameraRaw", "nonDestructiveTip"],
      properties: {
        lookNameKo: { type: "string", description: "보정 룩 이름(최대 140자)" },
        summary: { type: "string", description: "보정 목적과 Camera Raw 수치를 적용할 대상 레이어·마스크 범위(최대 420자)" },
        layerStyles: {
          type: "array",
          description: "비파괴 레이어 스타일 목록(권장 3~6개, 2~10개 이내)",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["effect", "blendMode", "opacityPct", "paramsSummary"],
            properties: {
              effect: { type: "string", description: "레이어 스타일 이름(최대 100자)" },
              blendMode: { type: "string", description: "블렌드 모드(최대 60자)" },
              opacityPct: { type: "integer", description: "불투명도(0~100 정수)" },
              paramsSummary: { type: "string", description: "이 효과의 대상 레이어·부위, 효과 크기 등 수치, 마스크에서 드러낼 부분과 보호할 인접 부위(최대 340자)" },
            },
          },
        },
        cameraRaw: {
          type: "object",
          additionalProperties: false,
          required: ["exposure", "contrast", "clarity", "dehaze", "temperatureShift", "grainPct"],
          properties: {
            exposure: { type: "number", description: "노출(-4~4 실수)" },
            contrast: { type: "integer", description: "대비(-100~100 정수)" },
            clarity: { type: "integer", description: "명료도(-100~100 정수)" },
            dehaze: { type: "integer", description: "안개 제거(-100~100 정수)" },
            temperatureShift: { type: "integer", description: "색온도 이동(-100~100 정수)" },
            grainPct: { type: "integer", description: "그레인(0~100 정수)" },
          },
        },
        nonDestructiveTip: { type: "string", description: "원본 보존 방식과 원고의 보존 조건(획·색·크롭 등), 효과를 껐다 켜서 제외 영역과 프레임을 비교하는 방법(최대 360자)" },
      },
    },
  },
  "scroll-pacing-auditor": {
    name: "toonstudio_scroll_pacing",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["rhythmVerdict", "averageGapPx", "cliffhangerScore", "cliffhangerTip", "beatPacing"],
      properties: {
        rhythmVerdict: { type: "string", description: "세로 스크롤 호흡 종합 진단(최대 320자)" },
        averageGapPx: {
          ...SCROLL_GAP_PX_BOUNDS,
          description: "beatPacing 구간들의 recommendedGapPx 산술평균에 맞춘 평균 권장 컷 간격(16~480px 권장, 16~1600 정수)",
        },
        cliffhangerScore: {
          type: ["integer", "null"],
          minimum: 0,
          maximum: 100,
          description: "원고에 있는 마지막 컷이 다음 화에 남기는 질문의 강도(편집 추정 0~100 정수). 판단할 엔딩이 없으면 null",
        },
        cliffhangerTip: { type: "string", description: "점수의 근거가 된 마지막 컷 원문을 「」로 인용한 뒤 이유와 수정안을 쓴다. 미평가 시 필요한 원고를 안내한다(최대 320자)" },
        beatPacing: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          description: "구간별 스크롤 호흡 분석(2~8개 구간)",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["section", "pacing", "recommendedGapPx", "readerRetentionNote"],
            properties: {
              section: { type: "string", description: "구간 이름(최대 100자)" },
              pacing: { type: "string", enum: ["tight", "steady", "breath", "drop"] },
              recommendedGapPx: {
                ...SCROLL_GAP_PX_BOUNDS,
                description: "구간 권장 컷 간격(16~480px 권장, 16~1600 정수)",
              },
              readerRetentionNote: { type: "string", description: "독자 시선 유지 메모(최대 280자)" },
            },
          },
        },
      },
    },
  },
  "thumbnail-hook-optimizer": {
    name: "toonstudio_thumbnail_hook",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["hookDiagnosis", "titleVariants", "thumbnailSpec"],
      properties: {
        hookDiagnosis: { type: "string", description: "현재 썸네일·제목 훅 진단(최대 420자)" },
        titleVariants: {
          type: "array",
          description: "회차 제목·부제 A/B 제안(권장 3안, 2~6개 이내)",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["variantLabel", "title", "subCopy", "hookReason"],
            properties: {
              variantLabel: { type: "string", description: "시안 라벨(최대 80자)" },
              title: { type: "string", description: "회차 제목(최대 160자)" },
              subCopy: { type: "string", description: "보조 카피(최대 240자)" },
              hookReason: { type: "string", description: "클릭 유도 근거(최대 360자)" },
            },
          },
        },
        thumbnailSpec: {
          type: "object",
          additionalProperties: false,
          required: ["focalSubject", "contrastNote", "textOverlayMaxChars", "cropSafetyTip"],
          properties: {
            focalSubject: { type: "string", description: "중심 피사체 구도. 원고가 지정한 색·질감이 어느 피사체나 화면 영역에 적용되는지 함께 표기(최대 280자)" },
            contrastNote: { type: "string", description: "명도·색채 대비 가이드(최대 320자)" },
            textOverlayMaxChars: { type: "integer", description: "썸네일 위 권장 최대 글자 수(0~40 정수)" },
            cropSafetyTip: { type: "string", description: "1:1·16:9 안전 크롭 팁(최대 320자)" },
          },
        },
      },
    },
  },
  "localization-glossary-check": {
    name: "toonstudio_localization_glossary",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["targetLocales", "glossary", "culturalNotes"],
      properties: {
        targetLocales: {
          type: "array",
          description: "대상 로케일 코드 목록(1~6개, 예: en, ja)",
          items: { type: "string" },
        },
        glossary: {
          type: "array",
          description: "핵심 고유명사·호칭·세계관 용어집(권장 6~12개, 2~16개 이내)",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["termKo", "en", "ja", "ruleNote"],
            properties: {
              termKo: { type: "string", description: "한국어 원문 용어(최대 120자)" },
              en: { type: "string", description: "영어 표준 번역(최대 180자)" },
              ja: { type: "string", description: "일본어 표준 번역(최대 180자)" },
              ruleNote: { type: "string", description: "통일 규칙 및 호칭 메모(최대 320자)" },
            },
          },
        },
        culturalNotes: {
          type: "array",
          description: "문화권 표현·말풍선 폭 확장 주의사항(1~8개 항목)",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["severity", "topic", "adaptationTip"],
            properties: {
              severity: { type: "string", enum: ["info", "warn"] },
              topic: { type: "string", description: "주의 항목 주제(최대 120자)" },
              adaptationTip: { type: "string", description: "현지화 및 식자 조정 팁(최대 360자)" },
            },
          },
        },
      },
    },
  },
  "mcp-workflow-macro": {
    name: "toonstudio_mcp_macro",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["macroTitle", "summary", "zeroCostSafe", "steps"],
      properties: {
        macroTitle: { type: "string", description: "매크로 제목(최대 180자)" },
        summary: { type: "string", description: "수동 작업 대상·수치·단위와 재개 조건을 포함하는 제작 순서(최대 420자)" },
        zeroCostSafe: { type: "boolean", description: "무과금 안전 경로 여부(항상 true)" },
        steps: {
          type: "array",
          minItems: 0,
          maxItems: 16,
          description: "허용된 도구로 실행 가능한 단계(전부 수동이면 빈 배열)",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["stepOrder", "toolName", "reasonKo", "argumentsJson"],
            properties: {
              stepOrder: { type: "integer", description: "1부터 시작하는 단계 번호(1~16 정수)" },
              toolName: { type: "string", description: "ToonStudio 표준 MCP 툴 이름(최대 100자)" },
              reasonKo: { type: "string", description: "단계 실행 이유 한 문장(최대 320자)" },
              argumentsJson: {
                type: "string",
                description: "해당 도구가 받는 인자 중 필요한 것만 담은 1줄 JSON 객체 문자열(240자 이내 권장, 최대 1600자)",
              },
            },
          },
        },
      },
    },
  },
});
