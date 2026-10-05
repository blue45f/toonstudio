import { FlaskConical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Switch } from "@/shared/components/ui/switch";
import { useNextgenLabSettings } from "@/shared/hooks/use-nextgen-lab-settings";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  getLatestComputePressure,
  isComputePressureSupported,
  observeComputePressure,
  type ComputePressureReading,
  type ComputePressureState,
} from "@/shared/lib/compute-pressure";
import {
  detectNextgenCapabilities,
  type NextgenCapabilityId,
} from "@/shared/lib/nextgen-web-capabilities";
import { updateNextgenLabSettings } from "@/shared/lib/nextgen-lab-settings";
import { cn } from "@/shared/lib/utils";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("NextgenLabSettingsSection", ko, en);

interface CapabilityCopy {
  readonly name: string;
  readonly purpose: string;
}

const CAPABILITY_COPY: Readonly<Record<NextgenCapabilityId, () => CapabilityCopy>> = {
  "compute-pressure": () => ({
    name: bi("기기 압력 감지", "Compute Pressure"),
    purpose: bi("CPU 압력을 읽어 무거운 기능의 품질 조절에 씁니다.", "Reads CPU pressure to adapt heavy-feature quality."),
  }),
  "idle-detection": () => ({
    name: bi("자리비움 감지", "Idle Detection"),
    purpose: bi("가상스튜디오 프레즌스의 자리비움 판정 후보입니다.", "Candidate for virtual-studio away presence."),
  }),
  "screen-wake-lock": () => ({
    name: bi("화면 꺼짐 방지", "Screen Wake Lock"),
    purpose: bi("작품을 읽는 동안 화면이 꺼지지 않게 합니다.", "Keeps the screen on while reading."),
  }),
  "eye-dropper": () => ({
    name: bi("화면 스포이트", "EyeDropper"),
    purpose: bi("화면 어디서든 색을 뽑아 채색에 씁니다.", "Picks a color from anywhere on screen."),
  }),
  "view-transitions": () => ({
    name: bi("페이지 전환 연출", "View Transitions"),
    purpose: bi("페이지 이동을 부드러운 전환으로 잇습니다.", "Smooths page-to-page navigation."),
  }),
  "speculation-rules": () => ({
    name: bi("페이지 미리 준비", "Speculation Rules"),
    purpose: bi("스튜디오 문서를 미리 렌더링해 진입을 빠르게 합니다.", "Prerenders the studio document for faster entry."),
  }),
  "scroll-driven-animations": () => ({
    name: bi("스크롤 연동 애니메이션", "Scroll-driven Animations"),
    purpose: bi("스크롤 위치에 맞춰 연출을 움직입니다.", "Drives motion from scroll position."),
  }),
  "webnn": () => ({
    name: bi("WebNN 추론", "WebNN inference"),
    purpose: bi("기기 내장 AI 가속(NPU 등) 추론의 실험 백엔드입니다.", "Experimental on-device AI acceleration backend."),
  }),
  "webxr": () => ({
    name: bi("WebXR 몰입 미리보기", "WebXR immersive preview"),
    purpose: bi("3D 배경을 VR/AR로 미리 보는 실험 후보입니다.", "Experimental VR/AR preview for 3D backgrounds."),
  }),
  "temporal": () => ({
    name: bi("Temporal 날짜 처리", "Temporal dates"),
    purpose: bi("날짜·시간 계산을 새 표준 API로 다루는 후보입니다.", "Candidate for next-generation date handling."),
  }),
  "window-management": () => ({
    name: bi("다중 화면 배치", "Window Management"),
    purpose: bi("분리 패널을 보조 화면에 배치하는 후보입니다.", "Candidate for placing detached panels on a second screen."),
  }),
  "web-midi": () => ({
    name: bi("Web MIDI", "Web MIDI"),
    purpose: bi("MIDI 기기를 잇는 후보 — 아직 연결된 제작 표면은 없습니다.", "Candidate — no connected production surface yet."),
  }),
  "built-in-ai": () => ({
    name: bi("브라우저 내장 AI", "Built-in AI"),
    purpose: bi("Chrome 내장 모델(Prompt API)로 키 없이 쓰는 온디바이스 AI입니다.", "Chrome's built-in model (Prompt API) — on-device AI with no key."),
  }),
  "navigation-api": () => ({
    name: bi("Navigation API", "Navigation API"),
    purpose: bi("이동 가로채기와 진행 상태를 브라우저가 직접 알려 줍니다.", "Browser-native navigation interception and state."),
  }),
  "long-animation-frames": () => ({
    name: bi("긴 프레임 계측", "Long Animation Frames"),
    purpose: bi("끊기는 프레임을 진단 표면에서 재는 계측입니다.", "Frame-jank measurement for diagnostics."),
  }),
  "move-before": () => ({
    name: bi("상태 보존 노드 이동", "moveBefore"),
    purpose: bi("노드를 옮겨도 포커스·재생 상태가 유지됩니다.", "Moves nodes without losing focus or playback state."),
  }),
  "file-system-observer": () => ({
    name: bi("파일 변경 감지", "File System Observer"),
    purpose: bi("로컬 파일·폴더의 변경을 감지하는 후보입니다.", "Candidate for watching local file changes."),
  }),
  "webmcp": () => ({
    name: bi("WebMCP 도구 노출", "WebMCP"),
    purpose: bi("사이트 기능을 AI 에이전트에 구조화해 노출하는 신생 표준입니다.", "Emerging standard for exposing site tools to AI agents."),
  }),
  "document-pip": () => ({
    name: bi("문서 Picture-in-Picture", "Document PiP"),
    purpose: bi("화상 허들·미니 플레이어를 작은 창으로 띄우는 후보입니다.", "Candidate for floating huddle or mini-player windows."),
  }),
  "storage-buckets": () => ({
    name: bi("Storage Buckets", "Storage Buckets"),
    purpose: bi("저장소를 버킷으로 나눠 만료 정책을 거는 후보입니다.", "Candidate for bucketed storage with expiry policies."),
  }),
  "digital-credentials": () => ({
    name: bi("디지털 자격증명", "Digital Credentials"),
    purpose: bi("지갑의 신원 자격증명을 제시받는 표준 — 인증 표면 전제 정리 중입니다.", "Wallet credential presentation — identity surfaces under review."),
  }),
  "popover-api": () => ({
    name: bi("Popover API", "Popover API"),
    purpose: bi("팝오버를 브라우저 기본 동작(top layer)으로 띄웁니다.", "Native top-layer popovers."),
  }),
  "anchor-positioning": () => ({
    name: bi("CSS 앵커 위치", "CSS Anchor Positioning"),
    purpose: bi("툴팁·메뉴 위치 계산을 CSS가 대신합니다.", "CSS-native positioning for tooltips and menus."),
  }),
  "field-sizing": () => ({
    name: bi("입력 자동 크기", "field-sizing"),
    purpose: bi("입력 필드가 내용에 맞춰 스스로 커집니다.", "Fields that size themselves to their content."),
  }),
  "scroll-state-queries": () => ({
    name: bi("스크롤 상태 쿼리", "Scroll-state Queries"),
    purpose: bi("스크롤 도달·고정 상태를 CSS만으로 판정합니다.", "Scroll and stuck state, judged in CSS alone."),
  }),
};

const PRESSURE_LABELS: Readonly<Record<ComputePressureState, () => string>> = {
  nominal: () => bi("여유", "Nominal"),
  fair: () => bi("보통", "Fair"),
  serious: () => bi("높음", "Serious"),
  critical: () => bi("매우 높음", "Critical"),
};

function ToggleRow({
  title,
  desc,
  checked,
  onCheckedChange,
}: {
  readonly title: string;
  readonly desc: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  );
}

/**
 * 실험 기능(차세대 웹 기술) 설정 섹션.
 * 능력 감지를 통과한 환경에서만 각 기능이 동작하고, 미지원이면 조용히 없다.
 * 여기서 보여 주는 지원 여부는 이 기기·브라우저의 실제 감지 결과다.
 */
export function NextgenLabSettingsSection() {
  useBilingualI18nRevision();
  const settings = useNextgenLabSettings();
  const capabilities = useMemo(() => detectNextgenCapabilities(), []);
  const pressureSupported = isComputePressureSupported();
  const [pressure, setPressure] = useState<ComputePressureReading | null>(
    () => getLatestComputePressure(),
  );

  useEffect(() => {
    if (!pressureSupported) return;
    return observeComputePressure(setPressure);
  }, [pressureSupported]);

  return (
    <section
      className="rounded-2xl border border-line bg-panel/40 p-5"
      aria-labelledby="nextgen-lab-heading"
    >
      <div className="mb-1 flex items-center gap-2">
        <FlaskConical size={18} aria-hidden className="text-accent" />
        <h2 id="nextgen-lab-heading" className="text-base font-semibold">
          {bi("실험 기능", "Experimental features")}
        </h2>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
          {bi("실험", "Beta")}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-fg-3">
        {bi(
          "최신 브라우저에서만 쓸 수 있는 차세대 웹 기술을 미리 켜 보는 곳입니다. 지원하지 않는 브라우저에서는 해당 기능이 조용히 꺼지고, 기존 기능은 그대로 동작합니다.",
          "Preview next-generation web features that only newer browsers support. Where a browser lacks support, the feature quietly stays off and everything else works as before.",
        )}
      </p>

      <div className="mt-2 divide-y divide-line">
        <ToggleRow
          title={bi("읽는 동안 화면 켜 두기", "Keep screen on while reading")}
          desc={bi(
            "작품 리더를 여는 동안 화면이 자동으로 꺼지지 않습니다.",
            "Prevents the screen from sleeping while the reader is open.",
          )}
          checked={settings.readerWakeLock}
          onCheckedChange={(checked) => updateNextgenLabSettings({ readerWakeLock: checked })}
        />
        <ToggleRow
          title={bi("스튜디오 미리 준비하기", "Prepare the studio ahead of time")}
          desc={bi(
            "스튜디오로 이동할 기미가 보이면 문서를 미리 렌더링해 진입을 빠르게 합니다. Chromium 계열에서만 동작합니다.",
            "Prerenders the studio document when navigation looks likely. Chromium only.",
          )}
          checked={settings.studioPrerender}
          onCheckedChange={(checked) => updateNextgenLabSettings({ studioPrerender: checked })}
        />
        <ToggleRow
          title={bi("읽기 시작할 때 화면 전환 효과", "Transition effect when starting to read")}
          desc={bi(
            "작품 상세에서 리더로 넘어갈 때 부드러운 전환을 입힙니다. 동작 줄이기 설정에서는 자동으로 꺼집니다.",
            "Adds a smooth transition from title details into the reader. Respects reduced-motion settings.",
          )}
          checked={settings.viewTransitions}
          onCheckedChange={(checked) => updateNextgenLabSettings({ viewTransitions: checked })}
        />
      </div>

      <h3 className="mt-4 text-sm font-semibold">
        {bi("이 기기에서 쓸 수 있는 기술", "What this device supports")}
      </h3>
      <ul className="mt-2 divide-y divide-line">
        {(Object.keys(CAPABILITY_COPY) as NextgenCapabilityId[]).map((id) => {
          const copy = CAPABILITY_COPY[id]();
          const supported = capabilities[id];
          return (
            <li key={id} className="flex items-start justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{copy.name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{copy.purpose}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                  supported ? "bg-accent-soft text-accent" : "bg-raised text-fg-3",
                )}
              >
                {supported ? bi("지원", "Supported") : bi("미지원", "Unsupported")}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 rounded-xl bg-raised/60 px-4 py-3">
        <p className="text-xs leading-relaxed text-fg-2">
          {bi("현재 기기 압력", "Current device pressure")}
          {": "}
          {pressureSupported
            ? pressure
              ? PRESSURE_LABELS[pressure.state]()
              : bi("측정 중…", "Measuring…")
            : bi(
                "이 브라우저에서는 기기 압력을 읽을 수 없습니다.",
                "This browser cannot report device pressure.",
              )}
        </p>
      </div>
    </section>
  );
}
