// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dBlenderFantasyWebtoonPanel } from "./StudioBg3dBlenderFantasyWebtoonPanel";

describe("StudioBg3dBlenderFantasyWebtoonPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("실제 웹 모델링 작업대 경로를 안내하고 비활성 상태에서는 이동을 막는다", () => {
    const { rerender } = render(<StudioBg3dBlenderFantasyWebtoonPanel />);
    const link = screen.getByRole("link", { name: "3D 모델링 작업대로 이동" });
    expect(link.getAttribute("href")).toBe("/studio/3d/dcc/model");
    expect(link.hasAttribute("aria-disabled")).toBe(false);
    expect(screen.getByLabelText("웹 모델링 작업대").textContent).toContain("설정 검토와 배경 프리셋");

    rerender(<StudioBg3dBlenderFantasyWebtoonPanel disabled />);
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(fireEvent.click(link)).toBe(false);
    expect(
      screen.getByTestId("bg3d-blender-v28-disabled-reason").textContent,
    ).toContain("읽기 전용 상태");
  });

  it("renders Unslop 9-Pass workbench UI, Genre Lock-In guardrail, Weekly 70-Cut ROI simulator, Scene Isolation badge, and Verify AI gate", () => {
    const onApplyLightingRig = vi.fn();
    const onApplyNprShader = vi.fn();
    const onApplyFreestyleInk = vi.fn();
    const onApplyWeaponRig = vi.fn();
    const onApplyMonsterIk = vi.fn();
    const onSimulateCrowd = vi.fn();
    const onSelectFreshIdeaLens = vi.fn();
    const onVerifyAiGate = vi.fn();
    const onInsertScenePrimitives = vi.fn();

    render(
      <StudioBg3dBlenderFantasyWebtoonPanel
        onApplyLightingRig={onApplyLightingRig}
        onApplyNprShader={onApplyNprShader}
        onApplyFreestyleInk={onApplyFreestyleInk}
        onApplyWeaponRig={onApplyWeaponRig}
        onApplyMonsterIk={onApplyMonsterIk}
        onSimulateCrowd={onSimulateCrowd}
        onSelectFreshIdeaLens={onSelectFreshIdeaLens}
        onVerifyAiGate={onVerifyAiGate}
        onInsertScenePrimitives={onInsertScenePrimitives}
      />,
    );

    expect(screen.getByTestId("bg3d-blender-fantasy-webtoon-panel")).toBeTruthy();
    expect(screen.getByTestId("bg3d-blender-summary-badge").textContent).toContain(
      "어검 12자루",
    );

    // 1. EEVEE 광원 리그 및 Kelvin 슬라이더 조작
    fireEvent.click(
      screen.getByTestId("bg3d-blender-light-rig-holy-sword-awakening-halo"),
    );
    expect(onApplyLightingRig).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByTestId("bg3d-blender-kelvin-slider"), {
      target: { value: "2400" },
    });
    expect(
      screen.getByTestId("bg3d-blender-eevee-lighting-section").textContent,
    ).toContain("2400K");

    // 2. NPR ShaderNodeTree & Freestyle 선화 프리셋 선택
    fireEvent.click(
      screen.getByTestId("bg3d-blender-npr-shader-arcane-mana-crystal-gem"),
    );
    expect(onApplyNprShader).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByTestId("bg3d-blender-freestyle-arcane-blueprint-xray-lineart"),
    );
    expect(onApplyFreestyleInk).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("bg3d-blender-freestyle-readout").textContent,
    ).toContain("추출 3선분");

    // 3. 판타지 무기 포지 & 소켓/각성 슬라이더
    fireEvent.click(
      screen.getByTestId("bg3d-blender-weapon-imperial-holy-greatsword"),
    );
    expect(onApplyWeaponRig).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByTestId("bg3d-blender-weapon-socket-back-sheath"),
    );
    fireEvent.change(
      screen.getByTestId("bg3d-blender-weapon-awakening-slider"),
      { target: { value: "1" } },
    );
    expect(
      screen.getByTestId("bg3d-blender-weapon-forge-section").textContent,
    ).toContain("100%");

    // 4. 몬스터 다관절 iTaSC IK 및 포즈 전환
    fireEvent.click(
      screen.getByTestId("bg3d-blender-monster-abyssal-arachnid-queen"),
    );
    expect(onApplyMonsterIk).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByTestId("bg3d-blender-monster-pose-wing-buffet-breath"),
    );
    expect(onApplyMonsterIk).toHaveBeenCalledTimes(2);

    // 5. GeometryNodes & BoidBrain 대규모 군단
    fireEvent.click(
      screen.getByTestId("bg3d-blender-crowd-royal-paladin-phalanx-march"),
    );
    expect(onSimulateCrowd).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByTestId("bg3d-blender-crowd-count-slider"), {
      target: { value: "240" },
    });
    expect(
      screen.getByTestId("bg3d-blender-crowd-readout").textContent,
    ).toContain("240기");

    // 5B. 정량 리드타임·주간 70컷 ROI·장르 락인·씬 격리·룩데브 4단계 체크리스트 검증
    expect(
      screen.getByTestId("bg3d-blender-cycle-time-benchmark").textContent,
    ).toContain("컷당 2D 리터칭");
    expect(
      screen.getByTestId("bg3d-blender-scene-isolation-badge").textContent,
    ).toContain("교차 오염 0건");
    expect(
      screen.getByTestId("bg3d-blender-lookdev-checklist").textContent,
    ).toContain("1. 장르 베이스 선언");

    fireEvent.change(screen.getByTestId("bg3d-blender-roi-adoption-slider"), {
      target: { value: "60" },
    });
    expect(
      screen.getByTestId("bg3d-blender-weekly-roi-readout").textContent,
    ).toContain("3D 60%");

    // 원클릭 로판 살롱 플레이북 실행 시 로판 1.35px 장르 락인 정상 활성화 확인
    fireEvent.click(screen.getByTestId("bg3d-blender-playbook-rofan-salon-btn"));
    expect(onInsertScenePrimitives).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("bg3d-blender-genre-lock-status").textContent,
    ).toContain("로판 살롱 락인 정상");

    // 로판 락인 상태에서 2.8px G펜으로 수동 변경 시 이탈 경고 감지 확인
    fireEvent.click(
      screen.getByTestId("bg3d-blender-freestyle-fantasy-action-gpen-calligraphic"),
    );
    expect(
      screen.getByTestId("bg3d-blender-genre-lock-status").textContent,
    ).toContain("이탈 감지");

    // 액션 전투 세트 클릭 시 2.8px G펜 락인으로 정상 정렬 확인
    fireEvent.click(screen.getByTestId("bg3d-blender-playbook-action-gpen-btn"));
    expect(
      screen.getByTestId("bg3d-blender-genre-lock-status").textContent,
    ).toContain("액션 전투 락인 정상");

    // Wave 5: 5대 장르 공통 건축 기준선(V19) 전환 및 무채색 암실 검수 모드 검증
    expect(
      screen.getByTestId("bg3d-blender-shared-datum-panel").textContent,
    ).toContain("개구부 2.40m");
    fireEvent.click(screen.getByTestId("bg3d-blender-datum-genre-scifi"));
    expect(
      screen.getByTestId("bg3d-blender-rejection-roi-readout").textContent,
    ).toContain("SF 함교 에어락(74컷) 마감 반려율 18.5%→2.3%");

    fireEvent.click(screen.getByTestId("bg3d-blender-darkroom-proofing-toggle"));
    expect(
      screen.getByTestId("bg3d-blender-fantasy-webtoon-panel").getAttribute(
        "data-darkroom-proofing",
      ),
    ).toBe("true");
    expect(
      screen.getByTestId("bg3d-blender-darkroom-status").textContent,
    ).toContain("ΔE 0.0");

    // Wave 6 (V20): 개폐형 가동 파츠 슬라이더(0~100%) & 캐릭터 IK 스냅 소켓 & follow-3d 속도선 고정 검증
    expect(
      screen.getByTestId("bg3d-blender-articulated-ik-section").textContent,
    ).toContain("5C. 개폐형 가동 파츠(V20)");
    fireEvent.click(
      screen.getByTestId("bg3d-blender-v20-prop-scifi-iris-airlock"),
    );
    fireEvent.change(screen.getByTestId("bg3d-blender-v20-open-slider"), {
      target: { value: "80" },
    });
    expect(
      screen.getByTestId("bg3d-blender-articulated-kinematics-readout")
        .textContent,
    ).toContain("SF 블래스트 에어락 V20 개폐 80%");
    expect(
      screen.getByTestId("bg3d-blender-ik-socket-wrist-desk").textContent,
    ).toContain("Z 0.92m");
    expect(
      screen.getByTestId("bg3d-blender-ik-summary-readout").textContent,
    ).toContain("접점 보정 0.0분");

    // Wave 7 (V21): 개폐율 연동 가변 슬릿 고드레이·그림자 드리프트 & 3연속 시퀀스(15%->65%->100%) 검증
    expect(
      screen.getByTestId("bg3d-blender-slit-godray-section").textContent,
    ).toContain("5D. 개폐율 연동 가변 슬릿 고드레이(V21)");
    fireEvent.click(screen.getByTestId("bg3d-blender-v21-beat-15"));
    expect(
      screen.getByTestId("bg3d-blender-slit-godray-readout").textContent,
    ).toContain("슬릿 폭 0.39m");
    expect(
      screen.getByTestId("bg3d-blender-bokeh-fstop-badge").textContent,
    ).toContain("f/1.8");
    fireEvent.click(screen.getByTestId("bg3d-blender-v21-beat-100"));
    expect(
      screen.getByTestId("bg3d-blender-slit-godray-readout").textContent,
    ).toContain("슬릿 폭 1.68m");
    expect(
      screen.getByTestId("bg3d-blender-bokeh-fstop-badge").textContent,
    ).toContain("f/5.6");
    fireEvent.change(screen.getByTestId("bg3d-blender-interaction-cut-slider"), {
      target: { value: "50" },
    });
    expect(
      screen.getByTestId("bg3d-blender-stacked-interaction-roi-readout")
        .textContent,
    ).toContain("상호작용 50%(35컷)");

    // Wave 8 (V22): 보케 스타일 전환 및 분기별 세이브 원고 비축 시뮬레이터 검증
    fireEvent.click(
      screen.getByTestId("bg3d-blender-v22-mote-rofan-gilded-petals"),
    );
    fireEvent.change(screen.getByTestId("bg3d-blender-climax-freq-slider"), {
      target: { value: "4" },
    });
    expect(
      screen.getByTestId("bg3d-blender-quarterly-banked-readout").textContent,
    ).toContain("회차당 3연속 시퀀스 4회");

    // Wave 9 (V23): Z-심도 3D 효과음·기준선 군중(4/6/15인)·멀티 시간대(5600K/3200K/8500K)·스크롤 여백·.toonlayers.json 매니페스트 검증
    expect(
      screen.getByTestId("bg3d-blender-v23-zdepth-compositor-card").textContent,
    ).toContain("Z-심도 3D 효과음(SFX)");
    fireEvent.click(screen.getByTestId("bg3d-blender-v23-tod-moonlight-8500k"));
    expect(
      screen.getByTestId("bg3d-blender-v23-tod-badge").textContent,
    ).toContain("8500K");
    fireEvent.click(screen.getByTestId("bg3d-blender-v23-crowd-15"));
    expect(
      screen.getByTestId("bg3d-blender-v23-zdepth-readout").textContent,
    ).toContain("군중 15인");
    fireEvent.change(screen.getByTestId("bg3d-blender-v23-gutter-slider"), {
      target: { value: "360" },
    });
    expect(
      screen.getByTestId("bg3d-blender-v23-scroll-pacing-readout").textContent,
    ).toContain("여백 360px");
    fireEvent.click(screen.getByTestId("bg3d-blender-v23-manifest-toggle"));
    expect(
      screen.getByTestId("bg3d-blender-v23-manifest-json").textContent,
    ).toContain("toonstudio.toonlayers.v23");

    // Wave 10 (V24): 건축 차폐 기상·듀얼 포컬(24mm×95mm)·70컷 4막 컬러 스크립트·KO/EN/JA 식자·.toonmotion.json 검증
    expect(
      screen.getByTestId("bg3d-blender-v24-weather-motion-card").textContent,
    ).toContain("건축 차폐 기상·수막 파문 V24");
    fireEvent.click(
      screen.getByTestId("bg3d-blender-v24-weather-eaves-rain-ripples"),
    );
    expect(
      screen.getByTestId("bg3d-blender-v24-weather-readout").textContent,
    ).toContain("실내 천장 누수 0건");
    fireEvent.change(screen.getByTestId("bg3d-blender-v24-char-focal-slider"), {
      target: { value: "95" },
    });
    expect(
      screen.getByTestId("bg3d-blender-v24-weather-readout").textContent,
    ).toContain("24mm×95mm");
    fireEvent.click(screen.getByTestId("bg3d-blender-v24-act-act1-setup"));
    expect(
      screen.getByTestId("bg3d-blender-v23-tod-badge").textContent,
    ).toContain("5600K");
    fireEvent.click(screen.getByTestId("bg3d-blender-v24-locale-EN"));
    expect(
      screen.getByTestId("bg3d-blender-v24-locale-readout").textContent,
    ).toContain("[EN]");
    fireEvent.click(screen.getByTestId("bg3d-blender-v24-motion-toggle"));
    expect(
      screen.getByTestId("bg3d-blender-v24-motion-json").textContent,
    ).toContain("toonstudio.toonmotion.v24");

    // Wave 11 (V25): 기류 패브릭·하프 미러 반사창·회차 간 연속성 원장·단행본(B5/A5) 오버스캔·.toonaudio.json 검증
    expect(
      screen.getByTestId("bg3d-blender-v25-wind-drape-card").textContent,
    ).toContain("기류 연동 패브릭·하프 미러 반사창 V25");
    fireEvent.click(screen.getByTestId("bg3d-blender-v25-fabric-rofan-velvet"));
    expect(
      screen.getByTestId("bg3d-blender-v25-drape-readout").textContent,
    ).toContain("하프 미러 Fresnel");
    fireEvent.click(screen.getByTestId("bg3d-blender-v25-ledger-lock-btn"));
    expect(
      screen.getByTestId("bg3d-blender-v25-continuity-badge").textContent,
    ).toContain("연속성 일치");
    fireEvent.click(screen.getByTestId("bg3d-blender-v24-act-act3-climax"));
    expect(
      screen.getByTestId("bg3d-blender-v25-continuity-badge").textContent,
    ).toContain("연속성 이탈 감지");
    fireEvent.click(screen.getByTestId("bg3d-blender-v25-format-A5"));
    expect(
      screen.getByTestId("bg3d-blender-v25-overscan-readout").textContent,
    ).toContain("A5 펼침면 302×216mm");
    fireEvent.click(screen.getByTestId("bg3d-blender-v25-audio-toggle"));
    expect(
      screen.getByTestId("bg3d-blender-v25-audio-json").textContent,
    ).toContain("toonstudio.toonaudio.v25");

    // Wave 12 (V26): 3단계 파손·흔적·대사 밀도 선화 감쇠·독자 가독성(OLED/색각)·.toonsubs.vtt·4채널 출고 게이트 검증
    expect(
      screen.getByTestId("bg3d-blender-v26-aftermath-card").textContent,
    ).toContain("3단계 파손·흔적 V26");
    fireEvent.click(screen.getByTestId("bg3d-blender-v26-stage-shattered"));
    expect(
      screen.getByTestId("bg3d-blender-v26-aftermath-readout").textContent,
    ).toContain("파편 28개");
    fireEvent.change(screen.getByTestId("bg3d-blender-v26-dialogue-slider"), {
      target: { value: "80" },
    });
    expect(
      screen.getByTestId("bg3d-blender-v26-aftermath-readout").textContent,
    ).toContain("-46.4%");
    fireEvent.click(
      screen.getByTestId("bg3d-blender-v26-display-oled-night-dim"),
    );
    expect(
      screen.getByTestId("bg3d-blender-v26-display-readout").textContent,
    ).toContain("야간 저조도 OLED (18%)");
    expect(
      screen.getByTestId("bg3d-blender-v26-display-readout").textContent,
    ).toContain("통과");
    fireEvent.click(screen.getByTestId("bg3d-blender-v26-vtt-toggle"));
    expect(
      screen.getByTestId("bg3d-blender-v26-vtt-preview").textContent,
    ).toContain("WEBVTT");
    expect(
      screen.getByTestId("bg3d-blender-v26-vtt-preview").textContent,
    ).toContain("toonstudio.toonsubs.v26");

    // Wave 13 (V27): 잔류 연무·아지랑이·모바일 60fps 프록시 LOD 버짓 가드·절단신공 스코어러·.toonpack.json 검증
    expect(
      screen.getByTestId("bg3d-blender-v27-dust-lod-card").textContent,
    ).toContain("잔류 연무·아지랑이 V27");
    expect(
      screen.getByTestId("bg3d-blender-v27-lod-budget-badge").textContent,
    ).toContain("60fps 정상");
    fireEvent.click(screen.getByTestId("bg3d-blender-v27-proxy-lod-toggle"));
    expect(
      screen.getByTestId("bg3d-blender-v27-lod-budget-badge").textContent,
    ).toContain("프록시 LOD 권장");
    fireEvent.click(screen.getByTestId("bg3d-blender-v27-proxy-lod-toggle"));
    expect(
      screen.getByTestId("bg3d-blender-v27-lod-budget-badge").textContent,
    ).toContain("60fps 정상");
    fireEvent.change(screen.getByTestId("bg3d-blender-v27-cliffhanger-slider"), {
      target: { value: "800" },
    });
    expect(
      screen.getByTestId("bg3d-blender-v27-cliffhanger-readout").textContent,
    ).toContain("S등급");
    fireEvent.click(screen.getByTestId("bg3d-blender-v27-pack-toggle"));
    expect(
      screen.getByTestId("bg3d-blender-v27-pack-json").textContent,
    ).toContain("toonstudio.toonpack.v27");

    // Wave 14 (V28): VRM 1.0 해부학 포즈 마네킹 · 3단 크롬 밀도(Focus/Simple/Pro) · GPU 누수 0건 검증
    expect(
      screen.getByTestId("bg3d-blender-v28-vrm-webgpu-card").textContent,
    ).toContain("VRM 1.0 해부학 포즈 마네킹 V28");
    fireEvent.click(
      screen.getByTestId("bg3d-blender-v28-pose-desk-seated-74cm"),
    );
    expect(
      screen.getByTestId("bg3d-blender-v28-vrm-readout").textContent,
    ).toContain("0.74m 접지");
    fireEvent.click(screen.getByTestId("bg3d-blender-v28-tier-focus"));
    expect(screen.queryByTestId("bg3d-blender-v28-webgpu-readout")).toBeNull();
    fireEvent.click(screen.getByTestId("bg3d-blender-v28-tier-pro"));
    expect(
      screen.getByTestId("bg3d-blender-v28-webgpu-readout").textContent,
    ).toContain("누수 0건");
    expect(
      screen.getByTestId("bg3d-blender-v28-roi-readout").textContent,
    ).toContain("44.8h");

    // Wave 15 (V29): 2인 시선·키 차이 듀오 VRM · 초성 빠른 호출(ㄹㅍ) · 180도 연출축 위반 감지 · 오프라인 복구 큐 검증
    expect(
      screen.getByTestId("bg3d-blender-v29-duo-ots-card").textContent,
    ).toContain("2인 시선 교차·키 차이 듀오 V29");
    fireEvent.change(screen.getByTestId("bg3d-blender-v29-cmdk-input"), {
      target: { value: "ㄹㅍ" },
    });
    fireEvent.click(screen.getByTestId("bg3d-blender-v29-cmdk-apply-first"));
    expect(
      screen.getByTestId("bg3d-blender-v29-duo-readout").textContent,
    ).toContain("188×164cm(키 차이 24cm");
    fireEvent.click(screen.getByTestId("bg3d-blender-v29-axis-toggle"));
    expect(
      screen.getByTestId("bg3d-blender-v29-axis180-badge").textContent,
    ).toContain("180도 연출축 위반 감지");
    fireEvent.click(screen.getByTestId("bg3d-blender-v29-offline-toggle"));
    expect(
      screen.getByTestId("bg3d-blender-v29-motion-offline-readout").textContent,
    ).toContain("유실 0컷");

    fireEvent.click(
      screen.getByTestId("bg3d-blender-archetype-emotion-closeup"),
    );
    expect(
      screen.getByTestId("bg3d-blender-prs-readout").textContent,
    ).toContain("95mm");

    fireEvent.click(
      screen.getByTestId("bg3d-blender-artistic-override-checkbox"),
    );
    expect(
      screen.getByTestId("bg3d-blender-scd-readout").textContent,
    ).toContain("예술적 허용");

    expect(
      screen.getByTestId("bg3d-blender-rights-bom-badge").textContent,
    ).toContain("Rights BOM 상용 출판 가능");
    fireEvent.click(screen.getByTestId("bg3d-blender-psd-tier-draft"));
    expect(
      screen.getByTestId("bg3d-blender-multipass-readout").textContent,
    ).toContain("DRAFT 960×1350");

    fireEvent.click(screen.getByTestId("bg3d-blender-auto-remediation-btn"));
    expect(
      screen.getByTestId("bg3d-blender-remediation-readout").textContent,
    ).toContain("보정 적용 1회 완료");

    expect(
      screen.getByTestId("bg3d-blender-phase4-scroll-pacing-readout").textContent,
    ).toContain("B_SZ");
    expect(
      screen.getByTestId("bg3d-blender-live-sync-readout").textContent,
    ).toContain("Blender 5.3 EEVEE 라이브 씬");
    expect(
      screen.getByTestId("bg3d-blender-cross-labs-bridge-readout").textContent,
    ).toContain("Cross-Labs Verify AI PASS");

    fireEvent.click(
      screen.getByTestId("bg3d-blender-fresh-lens-practical-playbook"),
    );
    expect(onSelectFreshIdeaLens).toHaveBeenCalledWith(
      "practical-playbook",
      expect.stringContaining("체크리스트"),
    );
    expect(
      screen.getByTestId("bg3d-blender-fresh-lens-detail").textContent,
    ).toContain("4. ✅ PRACTICAL PLAYBOOK");

    fireEvent.click(screen.getByTestId("bg3d-blender-verify-ai-run-btn"));
    expect(onVerifyAiGate).toHaveBeenCalledWith(expect.any(Number), true);
  });
});
