/**
 * XR 웹툰 공용 SVG 일러스트.
 *
 * 텍스트 설명 대신 "보는 재미"를 주기 위한 인라인 일러스트 모음.
 * 외부 에셋 없이 동작하며, 다크 배경에서 빛나는 그라데이션 스타일로 통일했다.
 */

interface XrArtProps {
  readonly width?: number;
  readonly height?: number;
  readonly title?: string;
}

function XrSvg({
  width = 320,
  height = 200,
  title,
  children,
  labelledby,
}: XrArtProps & { readonly children: React.ReactNode; readonly labelledby: string }): React.JSX.Element {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 320 200"
      role="img"
      aria-labelledby={labelledby}
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
    >
      {title ? <title id={labelledby}>{title}</title> : null}
      {children}
    </svg>
  );
}

/** 입체 웹툰 뷰어: 겹겹이 쌓인 레이어가 시차로 움직이는 모습 */
export function XrDepthArt(props: XrArtProps): React.JSX.Element {
  return (
    <XrSvg {...props} labelledby="xr-art-depth">
      <defs>
        <linearGradient id="xr-depth-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-raised)" />
          <stop offset="1" stopColor="var(--color-reader-panel)" />
        </linearGradient>
        <linearGradient id="xr-depth-l1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-line)" />
          <stop offset="1" stopColor="var(--color-panel)" />
        </linearGradient>
        <linearGradient id="xr-depth-l2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" />
          <stop offset="1" stopColor="var(--color-accent-2)" />
        </linearGradient>
        <linearGradient id="xr-depth-l3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-cool)" />
          <stop offset="1" stopColor="var(--color-line-strong)" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" rx="16" fill="url(#xr-depth-bg)" />
      {/* 뒤 레이어: 산 */}
      <path d="M20 160 L90 70 L160 160 Z" fill="url(#xr-depth-l1)" opacity="0.9" />
      <path d="M120 160 L200 50 L280 160 Z" fill="url(#xr-depth-l1)" opacity="0.7" />
      {/* 중간 레이어: 인물 실루엣 */}
      <circle cx="160" cy="105" r="22" fill="url(#xr-depth-l2)" />
      <rect x="146" y="124" width="28" height="42" rx="10" fill="url(#xr-depth-l2)" />
      {/* 앞 레이어: 말풍선 + 효과선 */}
      <rect x="196" y="52" width="86" height="40" rx="14" fill="url(#xr-depth-l3)" opacity="0.95" />
      <path d="M210 92 L202 108 L222 92 Z" fill="url(#xr-depth-l3)" />
      <g stroke="var(--color-cool)" strokeWidth="3" strokeLinecap="round" opacity="0.8">
        <line x1="36" y1="40" x2="56" y2="60" />
        <line x1="284" y1="140" x2="264" y2="160" />
        <line x1="40" y1="120" x2="62" y2="128" />
      </g>
      {/* 깊이 화살표 */}
      <g fill="none" stroke="var(--color-accent)" strokeWidth="2" opacity="0.7">
        <path d="M292 170 L292 40" strokeDasharray="6 5" />
        <path d="M286 48 L292 38 L298 48" />
      </g>
    </XrSvg>
  );
}

/** AR 프리뷰: 스마트폰에서 캐릭터가 튀어나오는 모습 */
export function XrArArt(props: XrArtProps): React.JSX.Element {
  return (
    <XrSvg {...props} labelledby="xr-art-ar">
      <defs>
        <linearGradient id="xr-ar-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-raised)" />
          <stop offset="1" stopColor="var(--color-reader-panel)" />
        </linearGradient>
        <linearGradient id="xr-ar-phone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-line)" />
          <stop offset="1" stopColor="var(--color-card)" />
        </linearGradient>
        <linearGradient id="xr-ar-char" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" />
          <stop offset="1" stopColor="var(--color-bad)" />
        </linearGradient>
        <radialGradient id="xr-ar-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--color-cool)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--color-cool)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" rx="16" fill="url(#xr-ar-bg)" />
      <ellipse cx="160" cy="168" rx="110" ry="18" fill="url(#xr-ar-glow)" />
      {/* 바닥 격자 */}
      <g stroke="var(--color-line)" strokeWidth="1" opacity="0.5">
        <line x1="40" y1="168" x2="280" y2="168" />
        <line x1="70" y1="168" x2="50" y2="196" />
        <line x1="130" y1="168" x2="120" y2="196" />
        <line x1="190" y1="168" x2="200" y2="196" />
        <line x1="250" y1="168" x2="270" y2="196" />
      </g>
      {/* 스마트폰 */}
      <rect x="52" y="70" width="64" height="104" rx="12" fill="url(#xr-ar-phone)" stroke="var(--color-line-strong)" strokeWidth="2" />
      <rect x="60" y="84" width="48" height="76" rx="4" fill="var(--color-cool)" opacity="0.25" />
      <circle cx="84" cy="78" r="2.5" fill="var(--color-fg-3)" />
      {/* 튀어나오는 캐릭터 */}
      <circle cx="196" cy="86" r="20" fill="url(#xr-ar-char)" />
      <rect x="183" y="104" width="26" height="44" rx="9" fill="url(#xr-ar-char)" />
      <rect x="168" y="112" width="14" height="26" rx="7" fill="url(#xr-ar-char)" opacity="0.85" transform="rotate(24 175 125)" />
      {/* 스캔 파동 */}
      <g fill="none" stroke="var(--color-cool)" opacity="0.7">
        <ellipse cx="196" cy="150" rx="34" ry="8" />
        <ellipse cx="196" cy="150" rx="52" ry="12" opacity="0.5" />
        <ellipse cx="196" cy="150" rx="70" ry="16" opacity="0.3" />
      </g>
    </XrSvg>
  );
}

/** VR 시어터: 헤드셋과 호 형태로 펼쳐진 패널 갤러리 */
export function XrVrArt(props: XrArtProps): React.JSX.Element {
  return (
    <XrSvg {...props} labelledby="xr-art-vr">
      <defs>
        <linearGradient id="xr-vr-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-raised)" />
          <stop offset="1" stopColor="var(--color-reader-panel)" />
        </linearGradient>
        <linearGradient id="xr-vr-panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" />
          <stop offset="1" stopColor="var(--color-accent-2)" />
        </linearGradient>
        <linearGradient id="xr-vr-hmd" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-line-strong)" />
          <stop offset="1" stopColor="var(--color-card)" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" rx="16" fill="url(#xr-vr-bg)" />
      {/* 갤러리 호 */}
      <g opacity="0.95">
        <rect x="36" y="60" width="44" height="62" rx="6" fill="url(#xr-vr-panel)" opacity="0.55" transform="rotate(-24 58 91)" />
        <rect x="92" y="44" width="48" height="68" rx="6" fill="url(#xr-vr-panel)" opacity="0.8" transform="rotate(-12 116 78)" />
        <rect x="152" y="38" width="52" height="74" rx="6" fill="url(#xr-vr-panel)" />
        <rect x="212" y="50" width="46" height="64" rx="6" fill="url(#xr-vr-panel)" opacity="0.45" transform="rotate(14 235 82)" />
      </g>
      {/* 현재 컷 하이라이트 */}
      <rect x="152" y="38" width="52" height="74" rx="6" fill="none" stroke="var(--color-cool)" strokeWidth="2.5" />
      {/* 헤드셋 */}
      <g>
        <rect x="118" y="132" width="84" height="44" rx="20" fill="url(#xr-vr-hmd)" stroke="var(--color-line-strong)" strokeWidth="2" />
        <rect x="132" y="142" width="56" height="24" rx="10" fill="var(--color-cool)" opacity="0.35" />
        <path d="M118 146 Q96 140 92 118" fill="none" stroke="var(--color-line-strong)" strokeWidth="8" strokeLinecap="round" />
        <path d="M202 146 Q224 140 228 118" fill="none" stroke="var(--color-line-strong)" strokeWidth="8" strokeLinecap="round" />
      </g>
      {/* 시선 */}
      <g stroke="var(--color-cool)" strokeWidth="2" strokeDasharray="5 4" opacity="0.8">
        <line x1="160" y1="132" x2="160" y2="112" />
        <line x1="150" y1="132" x2="136" y2="112" />
        <line x1="170" y1="132" x2="184" y2="112" />
      </g>
    </XrSvg>
  );
}

/** 3D→컷: 큐브가 웹툰 컷 이미지로 변환되는 도식 */
export function XrCutArt(props: XrArtProps): React.JSX.Element {
  return (
    <XrSvg {...props} labelledby="xr-art-cut">
      <defs>
        <linearGradient id="xr-cut-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-raised)" />
          <stop offset="1" stopColor="var(--color-reader-panel)" />
        </linearGradient>
        <linearGradient id="xr-cut-cube" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-cool)" />
          <stop offset="1" stopColor="var(--color-accent)" />
        </linearGradient>
        <linearGradient id="xr-cut-frame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-warn)" />
          <stop offset="1" stopColor="var(--color-accent-2)" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" rx="16" fill="url(#xr-cut-bg)" />
      {/* 3D 큐브 */}
      <g>
        <path d="M60 130 L60 80 L105 55 L105 105 Z" fill="url(#xr-cut-cube)" opacity="0.9" />
        <path d="M105 55 L150 80 L150 130 L105 105 Z" fill="url(#xr-cut-cube)" opacity="0.65" />
        <path d="M60 80 L105 55 L150 80 L105 105 Z" fill="var(--color-cool)" opacity="0.8" />
        <circle cx="105" cy="88" r="14" fill="var(--color-reader-panel)" opacity="0.55" />
      </g>
      {/* 변환 화살표 */}
      <g>
        <line x1="168" y1="100" x2="208" y2="100" stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" />
        <path d="M200 90 L212 100 L200 110" fill="none" stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" />
      </g>
      {/* 웹툰 컷 프레임 */}
      <g>
        <rect x="224" y="48" width="64" height="104" rx="4" fill="url(#xr-cut-frame)" />
        <rect x="230" y="56" width="52" height="60" rx="2" fill="var(--color-reader-panel)" opacity="0.75" />
        <circle cx="248" cy="80" r="10" fill="var(--color-warn)" />
        <rect x="238" y="94" width="20" height="14" rx="4" fill="var(--color-warn)" opacity="0.8" />
        {/* 말풍선 */}
        <rect x="238" y="122" width="36" height="20" rx="8" fill="var(--color-card)" opacity="0.95" />
        <g stroke="var(--color-fg)" strokeWidth="3" strokeLinecap="round" opacity="0.9">
          <line x1="236" y1="128" x2="270" y2="128" />
          <line x1="240" y1="135" x2="264" y2="135" />
        </g>
      </g>
    </XrSvg>
  );
}

/** VRM 스테이징: 포즈를 취하는 캐릭터 */
export function XrVrmArt(props: XrArtProps): React.JSX.Element {
  return (
    <XrSvg {...props} labelledby="xr-art-vrm">
      <defs>
        <linearGradient id="xr-vrm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-raised)" />
          <stop offset="1" stopColor="var(--color-reader-panel)" />
        </linearGradient>
        <linearGradient id="xr-vrm-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-cool)" />
          <stop offset="1" stopColor="var(--color-accent)" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" rx="16" fill="url(#xr-vrm-bg)" />
      {/* 무대 */}
      <ellipse cx="160" cy="172" rx="90" ry="14" fill="var(--color-accent)" opacity="0.25" />
      {/* 캐릭터: 손 흔들기 포즈 */}
      <g>
        <circle cx="160" cy="70" r="20" fill="url(#xr-vrm-body)" />
        {/* 웃는 표정 */}
        <path d="M150 66 q5 5 10 0" stroke="var(--color-reader-panel)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M152 78 q8 8 16 0" stroke="var(--color-reader-panel)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <rect x="146" y="92" width="28" height="46" rx="10" fill="url(#xr-vrm-body)" />
        <rect x="128" y="98" width="14" height="30" rx="7" fill="url(#xr-vrm-body)" opacity="0.9" transform="rotate(18 135 113)" />
        <rect x="178" y="66" width="14" height="34" rx="7" fill="url(#xr-vrm-body)" transform="rotate(-152 185 83)" />
        <circle cx="196" cy="52" r="7" fill="url(#xr-vrm-body)" />
        <rect x="148" y="136" width="11" height="32" rx="5" fill="url(#xr-vrm-body)" opacity="0.9" />
        <rect x="161" y="136" width="11" height="32" rx="5" fill="url(#xr-vrm-body)" opacity="0.9" />
      </g>
      {/* 포즈 프리셋 칩 */}
      <g fontSize="10" fontWeight="700">
        <rect x="24" y="30" width="52" height="22" rx="11" fill="var(--color-accent)" opacity="0.9" />
        <text x="50" y="45" textAnchor="middle" fill="var(--color-on-accent)">서 있기</text>
        <rect x="24" y="58" width="52" height="22" rx="11" fill="var(--color-cool)" opacity="0.85" />
        <text x="50" y="73" textAnchor="middle" fill="var(--color-reader-canvas)">손 흔들기</text>
        <rect x="244" y="30" width="52" height="22" rx="11" fill="var(--color-good)" opacity="0.85" />
        <text x="270" y="45" textAnchor="middle" fill="var(--color-on-accent)">기쁨</text>
      </g>
    </XrSvg>
  );
}

/** 빈 상태 일러스트: 비어 있는 액자와 물음표 */
export function XrEmptyArt(props: XrArtProps): React.JSX.Element {
  const { width = 220, height = 140 } = props;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 220 140"
      role="img"
      aria-labelledby="xr-art-empty"
      style={{ display: "block", maxWidth: "100%", height: "auto", margin: "0 auto" }}
    >
      <title id="xr-art-empty">{props.title ?? "비어 있음"}</title>
      <defs>
        <linearGradient id="xr-empty-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-raised)" />
          <stop offset="1" stopColor="var(--color-card)" />
        </linearGradient>
      </defs>
      <rect x="60" y="14" width="100" height="100" rx="10" fill="url(#xr-empty-frame)" stroke="var(--color-line-strong)" strokeWidth="2" strokeDasharray="8 6" />
      <text x="110" y="78" textAnchor="middle" fontSize="44" fontWeight="800" fill="var(--color-fg-3)">?</text>
      <ellipse cx="110" cy="124" rx="52" ry="8" fill="var(--color-accent)" opacity="0.18" />
      <g fill="var(--color-warn)" opacity="0.9">
        <circle cx="42" cy="34" r="3" />
        <circle cx="182" cy="52" r="2.5" />
        <circle cx="170" cy="108" r="3" />
      </g>
    </svg>
  );
}
