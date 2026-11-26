import type { ExtendedAssistMode } from "@toonstudio/contracts/studio-openai-assist-result";

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
          description: "카메라·인물·조명 블로킹 메모(권장 3~6개, 2~10개 이내, 항목당 최대 320자)",
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
              usageTip: { type: "string", description: "화면 면적·활용 팁(최대 320자)" },
            },
          },
        },
        lightingGuide: { type: "string", description: "키·림 조명 방향과 색온도 가이드(최대 420자)" },
        contrastWarning: { type: "string", description: "말풍선·인물 명도 대비 주의사항(최대 420자)" },
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
        summary: { type: "string", description: "보정 방향 요약(최대 420자)" },
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
              paramsSummary: { type: "string", description: "핵심 수치 요약(최대 340자)" },
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
        nonDestructiveTip: { type: "string", description: "비파괴 레이어·마스크 작업 팁(최대 360자)" },
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
          type: "integer",
          description: "beatPacing 구간들의 recommendedGapPx 산술평균에 맞춘 평균 권장 컷 간격(16~480px 권장, 16~1600 정수)",
        },
        cliffhangerScore: { type: "integer", description: "회차 엔딩 클리프행어 점수(0~100 정수)" },
        cliffhangerTip: { type: "string", description: "엔딩 여운·다음 화 클릭 유도 개선 팁(최대 320자)" },
        beatPacing: {
          type: "array",
          description: "구간별 스크롤 호흡 분석(2~8개 구간)",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["section", "pacing", "recommendedGapPx", "readerRetentionNote"],
            properties: {
              section: { type: "string", description: "구간 이름(최대 100자)" },
              pacing: { type: "string", enum: ["tight", "steady", "breath", "drop"] },
              recommendedGapPx: {
                type: "integer",
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
            focalSubject: { type: "string", description: "중심 피사체 구도(최대 280자)" },
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
        summary: { type: "string", description: "자동화 흐름 요약(최대 420자)" },
        zeroCostSafe: { type: "boolean", description: "무과금 안전 경로 여부(항상 true)" },
        steps: {
          type: "array",
          description: "핵심 실행 단계 3~7개(최대 10단계 이내)",
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
                description: "필수 키 3~5개만 담은 1줄 유효 JSON 문자열(240자 이내 권장, 최대 1600자)",
              },
            },
          },
        },
      },
    },
  },
});
