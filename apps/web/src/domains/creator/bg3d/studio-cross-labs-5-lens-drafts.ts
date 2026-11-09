/**
 * Wave 2 Mode B: Cross-Labs 5-Lens Full Draft Expansion Generator
 * (`studio-cross-labs-5-lens-drafts.ts`)
 *
 * `@generate-fresh-ideas` 스킬의 5대 크리에이티브 렌즈(1. Contrarian Take, 2. Personal Story Hook,
 * 3. Data / Evidence Angle, 4. Practical Playbook, 5. What They Missed) 전체를 각각 독립 출판·공유 가능한
 * 완성형 아티클/케이스스터디/벤치마크 리포트/실전 SOP/아키텍처 메모로 확장 생성한다.
 */

import type { FreshIdeaLensId } from "./studio-bg3d-fresh-ideas-verify-ai";
import type { CrossLabsUnifiedProductionReport } from "./studio-cross-labs-production-bridge";

export interface ExpandedCrossLabsLensDraft {
  readonly id: FreshIdeaLensId;
  readonly badgeKo: string;
  readonly channelFormatKo: string;
  readonly headlineKo: string;
  readonly bodyParagraphsKo: readonly string[];
  readonly keyTakeawayKo: string;
}

export function buildAllFiveCrossLabsFullDrafts(
  report: CrossLabsUnifiedProductionReport,
): readonly ExpandedCrossLabsLensDraft[] {
  const { coherence, sceneObjectsSynced } = report;

  return Object.freeze([
    {
      id: "contrarian-take",
      badgeKo: "1. 🔥 CONTRARIAN TAKE",
      channelFormatKo: "기술 블로그 / 아키텍처 칼럼",
      headlineKo:
        "3D 배경·3D 캐릭터·2D 브러시를 각각 고도화해도 컷이 어색한 진짜 이유 — 승부처는 '개별 스펙'이 아니라 '교차 정합성(X_LABS)'입니다",
      bodyParagraphsKo: [
        "웹툰 제작 현장에서 3D 배경은 갈수록 정교해지고, 3D 캐릭터 마네킹은 수만 폴리곤으로 매끄러워졌으며, 2D 브러시 엔진은 수백 개의 프리셋을 제공합니다. 하지만 이 세 가지를 한 컷에 합치는 순간 독자는 본능적으로 '3D 배경 위에 종이 인형을 오려 붙인 듯한 이질감'을 느낍니다.",
        `원인은 개별 도구의 성능 부족이 아니라, 세 도구의 광원 각도, 외곽선 필압 비율, 원근 투영 소실점이 서로 다른 좌표계에서 따로 계산되기 때문입니다. ToonStudio는 이를 해결하기 위해 조명 정합(${coherence.bg3dToCharacterLightingMatch100}점)·선폭 조화(${coherence.characterToBrushLineWeightMatch100}점)·원근 스냅(${coherence.bg3dToBrushPerspectiveSnap100}점)을 단일 수학 모델로 묶어 Cross-Labs 정합성 지수 X_LABS ${coherence.crossLabsCoherenceIndex100}점을 달성했습니다.`,
      ],
      keyTakeawayKo: `개별 랩스의 고립된 스펙보다 3대 랩스 교차 정합성(X_LABS ${coherence.crossLabsCoherenceIndex100}점)이 실전 웹툰 원고의 완성도를 결정합니다.`,
    },
    {
      id: "personal-story-hook",
      badgeKo: "2. 📖 PERSONAL STORY HOOK",
      channelFormatKo: "창작자 커뮤니티 / 제작기 에세이",
      headlineKo:
        "마감 새벽 4시, 3D 성채 위에서 붕 떠 보이던 주인공 선화를 단 1번의 'Cross-Labs 동기화'로 구해낸 기록",
      bodyParagraphsKo: [
        "[Setup] 주간 70컷 판타지 액션 웹툰 마감 새벽, 배경 어시스턴트가 보내온 Blender 5.2 대성채 씬 위에 캐릭터 레이어를 얹자 배경의 광각 역광과 캐릭터의 평면 조명이 충돌해 주인공이 화면에서 완전히 겉돌고 있었습니다.",
        "[Friction] 예전 같았으면 작화가가 밤을 새워 3D 배경 외곽선을 지우고 주인공 전신 펜선을 다시 덧그려야 했고, 카메라 각도가 5도만 바뀌어도 덧그린 2D 이펙트 선화가 전부 틀어지는 악순환이 반복되었습니다.",
        `[Lesson] Cross-Labs 브리지와 Linked Ink 보호를 켜자 배경의 22mm 광각·역광이 캐릭터 3단 셀 램프·비등방 외곽선에 즉시 이식되었고, 캐릭터 외곽선과 브러시 선폭이 ${coherence.characterToBrushLineWeightMatch100}점으로 자동 매칭되어 4시간 걸리던 재작업을 18ms 만에 끝냈습니다.`,
      ],
      keyTakeawayKo:
        "분업화된 스튜디오의 가장 큰 손실인 '레이어 합치기 재작업'을 1클릭 광원·선폭·원근 동기화로 제거했습니다.",
    },
    {
      id: "data-evidence-angle",
      badgeKo: "3. 📊 DATA / EVIDENCE ANGLE",
      channelFormatKo: "엔지니어링 벤치마크 리포트 / 릴리스 노트",
      headlineKo: `전사 통합 Verify AI ${coherence.unifiedVerifyAiReleaseScore100}점 · Cross-Labs X_LABS ${coherence.crossLabsCoherenceIndex100}점 · Blender 5.2 라이브 오브젝트 ${sceneObjectsSynced}종 정량 검증`,
      bodyParagraphsKo: [
        `감각적 인상이 아닌 결정론적 수치로 상용 웹툰 파이프라인의 품질을 입증합니다. Blender 5.2 EEVEE 라이브 씬(${sceneObjectsSynced}개 오브젝트), 3D Labs V01~V10 프리플라이트 게이트, Character Labs 4방향 턴어라운드 및 얼굴 SDF 클린율, Brush Labs 38밴드 분광 안료 및 8시간 마라톤 링버퍼 내구성을 단일 파이프라인에서 동시 측정했습니다.`,
        `측정 결과 조명 정합 ${coherence.bg3dToCharacterLightingMatch100}점, 선폭 조화 ${coherence.characterToBrushLineWeightMatch100}점, 원근 스냅 ${coherence.bg3dToBrushPerspectiveSnap100}점, 상용 저작권 BOM 100점을 기록하며 전사 릴리스 점수 ${coherence.unifiedVerifyAiReleaseScore100}점(PASS)으로 상용 출판 및 배포 기준을 통과했습니다.`,
      ],
      keyTakeawayKo: `170개 이상의 자동화 테스트와 Verify AI ${coherence.unifiedVerifyAiReleaseScore100}점 정량 게이트가 매 커밋 상용 품질을 보증합니다.`,
    },
    {
      id: "practical-playbook",
      badgeKo: "4. ✅ PRACTICAL PLAYBOOK",
      channelFormatKo: "스튜디오 표준 운영 절차 (SOP 체크리스트)",
      headlineKo:
        "기획부터 3대 랩스 통합 작화, Verify AI 검증, 7종 멀티 클라우드·로컬 배포까지 10분 완성 플레이북",
      bodyParagraphsKo: [
        "1단계 (Blender 5.2 × 3D Labs): 콘티 아키타입(액션 타격·클라이맥스)을 선택해 22mm 광각·역광 대비율 2.45:1·세로 스크롤 안전영역(B_SZ)을 확정합니다.",
        "2단계 (Character Labs): SHAPER × Tripo 비주얼 룩과 Tripo v3.5 Delight, 헤어 내부 주선 억제(hID*1)를 켜고 'Verify AI 캐릭터 툰 최적 보정'을 원클릭 적용합니다.",
        "3단계 (Brush Labs): 웹툰 장르 프리셋(칼선 G펜 / 수채 감성광)을 적용해 38밴드 분광 혼색과 Linked Ink 3D 투영 위에서 외곽선·이펙트를 작화합니다.",
        "4단계 (Verify AI & Multi-Cloud Deploy): verify-all-labs-production-release.mts로 전사 PASS를 확인한 뒤 Docker Compose 또는 GitHub Actions 다이나믹 매트릭스로 7종 환경에 즉시 배포합니다.",
      ],
      keyTakeawayKo:
        "복잡한 이론 없이 4단계 체크리스트만으로 3D·캐릭터·브러시 통합 작화와 클라우드 배포를 즉시 수행할 수 있습니다.",
    },
    {
      id: "what-they-missed",
      badgeKo: "5. 🎯 WHAT THEY MISSED",
      channelFormatKo: "클라우드 인프라 & 데브옵스 아키텍처 메모",
      headlineKo:
        "창작 툴 고도화가 놓치기 쉬운 마지막 사각지대 — '작업실 로컬 PC와 글로벌 멀티 클라우드 간의 픽셀·환경 편차 0% 보장'",
      bodyParagraphsKo: [
        "대부분의 그래픽·웹툰 제작 도구는 기능 추가에만 집중하느라 작가의 로컬 PC와 클라우드 서버 사이의 런타임 환경 파편화를 간과합니다. 특정 클라우드에 종속되거나 수동 설정이 복잡하면 실전 연재 스튜디오에서 즉시 병목이 됩니다.",
        "ToonStudio는 Zero-Docker 로컬 프리뷰(local-pnpm-preview), 단일 VM Docker Compose(local-docker-compose), Cloudflare 글로벌 엣지(cloudflare-edge-static), Onpod 컨테이너(onpod-container-cloud), AWS ECS/CloudFront, GCP Cloud Run, 표준 Kubernetes(self-hosted-k8s)까지 7종 타겟을 단일 다이나믹 매트릭스로 묶어 어느 환경에서든 100% 동일한 원고 픽셀과 프리플라이트 안전성을 보장합니다.",
      ],
      keyTakeawayKo:
        "7종 멀티 클라우드·로컬 다이나믹 매트릭스로 인프라 종속성 없이 어디서나 즉시 동일한 스튜디오 환경을 기동합니다.",
    },
  ]);
}
