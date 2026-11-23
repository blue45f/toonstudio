import type { HologramDemoScenePreset } from "./hologram-demo-scenes";
import type { HologramPlaneRole } from "./hologram-spatial-projection";

export interface HologramSceneLayerArtProps {
  readonly scene: HologramDemoScenePreset;
  readonly role: HologramPlaneRole;
  readonly locale: "ko" | "en";
  readonly idPrefix: string;
}

function NeonRooftopPlane({
  role,
  scene,
  locale,
  idPrefix,
}: HologramSceneLayerArtProps): React.JSX.Element {
  const skyId = `${idPrefix}-neon-sky`;
  const bladeId = `${idPrefix}-neon-blade`;
  const balloonText = locale === "ko" ? scene.balloonTextKo : scene.balloonTextEn;
  const sfxText = locale === "ko" ? scene.sfxTextKo : scene.sfxTextEn;

  if (role === "bg") {
    return (
      <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0%" stopColor="var(--color-canvas)" />
            <stop offset="55%" stopColor="var(--color-panel)" />
            <stop offset="100%" stopColor="var(--color-raised)" />
          </linearGradient>
        </defs>
        <rect x="-40" y="-30" width="720" height="480" fill={`url(#${skyId})`} />
        <circle cx="515" cy="92" r="46" fill="var(--color-cool)" opacity="0.24" />
        <circle cx="515" cy="92" r="30" fill="var(--color-accent)" opacity="0.3" />
        <g fill="var(--color-card)" stroke="var(--color-line)" strokeWidth="1.5" opacity="0.92">
          <rect x="26" y="138" width="68" height="260" />
          <rect x="106" y="102" width="84" height="296" />
          <rect x="206" y="156" width="64" height="242" />
          <rect x="372" y="116" width="78" height="282" />
          <rect x="466" y="148" width="86" height="250" />
          <rect x="562" y="124" width="62" height="274" />
        </g>
        <g fill="var(--color-cool)" opacity="0.45">
          <rect x="122" y="124" width="14" height="8" />
          <rect x="148" y="124" width="14" height="8" />
          <rect x="122" y="146" width="14" height="8" />
          <rect x="388" y="138" width="16" height="8" />
          <rect x="416" y="160" width="16" height="8" />
          <rect x="484" y="176" width="20" height="8" />
        </g>
        <g stroke="var(--color-cool)" strokeWidth="1.2" opacity="0.28">
          <line x1="80" y1="0" x2="40" y2="170" />
          <line x1="250" y1="0" x2="210" y2="180" />
          <line x1="420" y1="0" x2="380" y2="160" />
          <line x1="590" y1="0" x2="550" y2="190" />
        </g>
      </svg>
    );
  }

  if (role === "mid") {
    return (
      <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
        <path
          d="M-20 318 L195 294 L220 332 L456 322 L660 286 L660 440 L-20 440 Z"
          fill="var(--color-raised)"
          stroke="var(--color-line-strong)"
          strokeWidth="2"
        />
        <g stroke="var(--color-accent)" strokeWidth="3" fill="none" opacity="0.88">
          <rect x="64" y="218" width="96" height="44" rx="6" fill="var(--color-panel)" />
          <line x1="112" y1="262" x2="112" y2="306" />
          <line x1="80" y1="236" x2="144" y2="236" />
          <line x1="80" y1="248" x2="128" y2="248" />
        </g>
        <g stroke="var(--color-cool)" strokeWidth="2.4" fill="none" opacity="0.82">
          <path d="M512 162 L512 296" />
          <path d="M494 186 L530 186" />
          <path d="M500 208 L524 208" />
          <circle cx="512" cy="156" r="5" fill="var(--color-bad)" stroke="none" />
        </g>
        <line x1="20" y1="322" x2="620" y2="302" stroke="var(--color-cool)" strokeWidth="2" opacity="0.6" />
      </svg>
    );
  }

  if (role === "char") {
    return (
      <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
        <defs>
          <linearGradient id={bladeId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-cool)" />
            <stop offset="100%" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>
        {/* 휘날리는 스카프 */}
        <path
          d="M286 178 C236 164, 186 184, 138 158 C176 202, 226 204, 282 198 Z"
          fill="var(--color-bad)"
          opacity="0.92"
        />
        {/* 도약 실루엣 */}
        <circle cx="312" cy="148" r="24" fill="var(--color-fg)" />
        <path
          d="M294 176 L342 184 L362 246 L312 256 L276 230 Z"
          fill="var(--color-fg)"
          stroke="var(--color-cool)"
          strokeWidth="2.2"
        />
        <path d="M342 194 L406 168 L414 182 L352 212 Z" fill="var(--color-fg)" />
        <path d="M310 248 L266 322 L286 330 L328 264 Z" fill="var(--color-fg)" />
        <path d="M348 242 L408 304 L390 318 L334 260 Z" fill="var(--color-fg)" />
        {/* 에너지 블레이드 */}
        <path
          d="M402 172 L528 94 L434 192 Z"
          fill={`url(#${bladeId})`}
          stroke="var(--color-on-accent)"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  if (role === "fx") {
    return (
      <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
        <path
          d="M172 316 C288 214, 412 134, 574 74 C450 156, 336 244, 214 342 Z"
          fill="var(--color-cool)"
          opacity="0.34"
        />
        <path
          d="M196 308 C312 216, 428 140, 560 88"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <g stroke="var(--color-warn)" strokeWidth="2.4" strokeLinecap="round" opacity="0.9">
          <line x1="454" y1="126" x2="486" y2="102" />
          <line x1="472" y1="158" x2="508" y2="148" />
          <line x1="252" y1="274" x2="218" y2="294" />
          <line x1="410" y1="196" x2="438" y2="214" />
        </g>
        <text
          x="456"
          y="292"
          className="holo-plane-sfx"
          fill="var(--color-warn)"
          stroke="var(--color-canvas)"
          strokeWidth="4"
          paintOrder="stroke"
        >
          {sfxText}
        </text>
      </svg>
    );
  }

  return (
    <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
      <g transform="translate(26, 26)">
        <path
          d="M14 10 L264 6 L278 46 L258 84 L96 86 L74 114 L78 86 L12 82 Z"
          fill="var(--color-card)"
          stroke="var(--color-fg)"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <text x="142" y="46" textAnchor="middle" className="holo-plane-dialogue" fill="var(--color-fg)">
          {balloonText}
        </text>
      </g>
    </svg>
  );
}

function ArcaneLibraryPlane({
  role,
  scene,
  locale,
  idPrefix,
}: HologramSceneLayerArtProps): React.JSX.Element {
  const vaultId = `${idPrefix}-arcane-vault`;
  const auraId = `${idPrefix}-arcane-aura`;
  const balloonText = locale === "ko" ? scene.balloonTextKo : scene.balloonTextEn;
  const sfxText = locale === "ko" ? scene.sfxTextKo : scene.sfxTextEn;

  if (role === "bg") {
    return (
      <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
        <defs>
          <linearGradient id={vaultId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-canvas)" />
            <stop offset="100%" stopColor="var(--color-raised)" />
          </linearGradient>
        </defs>
        <rect x="-40" y="-30" width="720" height="480" fill={`url(#${vaultId})`} />
        <g fill="var(--color-panel)" stroke="var(--color-line)" strokeWidth="2">
          <path d="M90 390 L90 130 Q150 56 210 130 L210 390 Z" />
          <path d="M260 390 L260 112 Q320 34 380 112 L380 390 Z" />
          <path d="M430 390 L430 130 Q490 56 550 130 L550 390 Z" />
        </g>
        <g stroke="var(--color-warn)" strokeWidth="1.4" opacity="0.45">
          <line x1="150" y1="90" x2="150" y2="340" />
          <line x1="320" y1="74" x2="320" y2="340" />
          <line x1="490" y1="90" x2="490" y2="340" />
        </g>
        <g fill="var(--color-warn)" opacity="0.55">
          <circle cx="320" cy="84" r="5" />
          <circle cx="150" cy="118" r="3.5" />
          <circle cx="490" cy="118" r="3.5" />
        </g>
      </svg>
    );
  }

  if (role === "mid") {
    return (
      <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
        <rect x="-10" y="330" width="660" height="100" fill="var(--color-card)" stroke="var(--color-line-strong)" strokeWidth="2" />
        {/* 부유하는 마도서 3권 */}
        <g transform="translate(106, 174) rotate(-14)" fill="var(--color-panel)" stroke="var(--color-warn)" strokeWidth="2">
          <path d="M0 16 Q28 0 56 16 L56 48 Q28 32 0 48 Z" />
          <path d="M56 16 Q84 0 112 16 L112 48 Q84 32 56 48 Z" />
        </g>
        <g transform="translate(442, 148) rotate(12)" fill="var(--color-panel)" stroke="var(--color-accent)" strokeWidth="2">
          <path d="M0 14 Q26 0 52 14 L52 44 Q26 30 0 44 Z" />
          <path d="M52 14 Q78 0 104 14 L104 44 Q78 30 52 44 Z" />
        </g>
        <g transform="translate(486, 256) rotate(-8)" fill="var(--color-panel)" stroke="var(--color-cool)" strokeWidth="1.8">
          <rect x="0" y="0" width="66" height="44" rx="4" />
          <line x1="12" y1="14" x2="54" y2="14" />
          <line x1="12" y1="26" x2="44" y2="26" />
        </g>
      </svg>
    );
  }

  if (role === "char") {
    return (
      <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
        <defs>
          <radialGradient id={auraId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="320" cy="212" r="96" fill={`url(#${auraId})`} />
        <circle cx="320" cy="144" r="24" fill="var(--color-fg)" />
        <path
          d="M298 168 Q320 154 342 168 L368 238 L392 344 L248 344 L272 238 Z"
          fill="var(--color-fg)"
          stroke="var(--color-warn)"
          strokeWidth="2"
        />
        <path d="M294 206 L252 246" stroke="var(--color-fg)" strokeWidth="12" strokeLinecap="round" />
        <path d="M346 206 L392 224" stroke="var(--color-fg)" strokeWidth="12" strokeLinecap="round" />
        <circle cx="398" cy="224" r="14" fill="var(--color-warn)" opacity="0.88" />
      </svg>
    );
  }

  if (role === "fx") {
    return (
      <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
        <g fill="none" stroke="var(--color-warn)" strokeWidth="2.2" opacity="0.88">
          <circle cx="320" cy="216" r="108" strokeDasharray="10 6" />
          <circle cx="320" cy="216" r="84" />
          <polygon points="320,132 392,258 248,258" opacity="0.72" />
          <polygon points="320,300 392,174 248,174" opacity="0.72" />
        </g>
        <g fill="var(--color-accent)" opacity="0.82">
          <circle cx="212" cy="156" r="4" />
          <circle cx="434" cy="144" r="5" />
          <circle cx="458" cy="272" r="3.5" />
          <circle cx="192" cy="284" r="4.5" />
        </g>
        <text
          x="458"
          y="336"
          className="holo-plane-sfx"
          fill="var(--color-accent)"
          stroke="var(--color-canvas)"
          strokeWidth="4"
          paintOrder="stroke"
        >
          {sfxText}
        </text>
      </svg>
    );
  }

  return (
    <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
      <g transform="translate(34, 24)">
        <rect
          x="0"
          y="0"
          width="304"
          height="78"
          rx="36"
          fill="var(--color-card)"
          stroke="var(--color-warn)"
          strokeWidth="2.4"
        />
        <rect
          x="7"
          y="7"
          width="290"
          height="64"
          rx="30"
          fill="none"
          stroke="var(--color-line-strong)"
          strokeWidth="1.2"
        />
        <text x="152" y="45" textAnchor="middle" className="holo-plane-dialogue" fill="var(--color-fg)">
          {balloonText}
        </text>
      </g>
    </svg>
  );
}

function MurimBambooPlane({
  role,
  scene,
  locale,
  idPrefix,
}: HologramSceneLayerArtProps): React.JSX.Element {
  const mistId = `${idPrefix}-murim-mist`;
  const qiId = `${idPrefix}-murim-qi`;
  const balloonText = locale === "ko" ? scene.balloonTextKo : scene.balloonTextEn;
  const sfxText = locale === "ko" ? scene.sfxTextKo : scene.sfxTextEn;

  if (role === "bg") {
    return (
      <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
        <defs>
          <linearGradient id={mistId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-canvas)" />
            <stop offset="62%" stopColor="var(--color-panel)" />
            <stop offset="100%" stopColor="var(--color-raised)" />
          </linearGradient>
        </defs>
        <rect x="-40" y="-30" width="720" height="480" fill={`url(#${mistId})`} />
        <circle cx="484" cy="96" r="44" fill="var(--color-fg-2)" opacity="0.2" />
        <path
          d="M-30 296 Q90 166 218 242 T462 212 T670 264 L670 440 L-30 440 Z"
          fill="var(--color-raised)"
          opacity="0.72"
        />
        <path
          d="M-30 342 Q144 236 302 294 T670 288 L670 440 L-30 440 Z"
          fill="var(--color-card)"
          opacity="0.86"
        />
      </svg>
    );
  }

  if (role === "mid") {
    return (
      <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
        <g stroke="var(--color-good)" strokeWidth="10" strokeLinecap="round" opacity="0.62">
          <line x1="78" y1="0" x2="62" y2="420" />
          <line x1="128" y1="0" x2="116" y2="420" />
          <line x1="518" y1="0" x2="534" y2="420" />
          <line x1="566" y1="0" x2="584" y2="420" />
        </g>
        <g stroke="var(--color-line-strong)" strokeWidth="2.5" opacity="0.8">
          <line x1="65" y1="120" x2="82" y2="120" />
          <line x1="62" y1="240" x2="79" y2="240" />
          <line x1="520" y1="150" x2="537" y2="150" />
          <line x1="526" y1="270" x2="543" y2="270" />
        </g>
        <g fill="var(--color-good)" opacity="0.75">
          <ellipse cx="144" cy="126" rx="22" ry="6" transform="rotate(-24 144 126)" />
          <ellipse cx="164" cy="148" rx="18" ry="5" transform="rotate(14 164 148)" />
          <ellipse cx="496" cy="134" rx="22" ry="6" transform="rotate(22 496 134)" />
          <ellipse cx="476" cy="160" rx="18" ry="5" transform="rotate(-18 476 160)" />
        </g>
      </svg>
    );
  }

  if (role === "char") {
    return (
      <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
        {/* 삿갓 */}
        <path
          d="M242 152 Q316 112 390 152 Q316 164 242 152 Z"
          fill="var(--color-fg)"
          stroke="var(--color-good)"
          strokeWidth="2"
        />
        {/* 도포 실루엣 */}
        <path
          d="M288 164 L344 164 L368 256 L392 346 L246 346 L272 252 Z"
          fill="var(--color-fg)"
        />
        <path
          d="M260 226 L186 244 L192 256 L274 242 Z"
          fill="var(--color-fg)"
        />
        {/* 검신 */}
        <path
          d="M348 228 L522 192 L354 242 Z"
          fill="var(--color-cool)"
          stroke="var(--color-fg)"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  if (role === "fx") {
    return (
      <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
        <defs>
          <linearGradient id={qiId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-good)" stopOpacity="0.1" />
            <stop offset="50%" stopColor="var(--color-cool)" stopOpacity="0.88" />
            <stop offset="100%" stopColor="var(--color-fg)" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <path
          d="M116 254 C240 202, 404 176, 568 184 C432 216, 268 242, 134 276 Z"
          fill={`url(#${qiId})`}
        />
        <g fill="var(--color-good)" opacity="0.92">
          <ellipse cx="218" cy="144" rx="14" ry="4" transform="rotate(-32 218 144)" />
          <ellipse cx="446" cy="274" rx="15" ry="4" transform="rotate(26 446 274)" />
          <ellipse cx="386" cy="116" rx="12" ry="3.5" transform="rotate(-14 386 116)" />
        </g>
        <text
          x="456"
          y="314"
          className="holo-plane-sfx"
          fill="var(--color-good)"
          stroke="var(--color-canvas)"
          strokeWidth="4"
          paintOrder="stroke"
        >
          {sfxText}
        </text>
      </svg>
    );
  }

  return (
    <svg className="holo-plane-svg" viewBox="0 0 640 420" aria-hidden="true">
      <g transform="translate(28, 22)">
        <rect
          x="0"
          y="0"
          width="318"
          height="74"
          rx="10"
          fill="var(--color-card)"
          stroke="var(--color-fg)"
          strokeWidth="2.4"
          strokeDasharray="14 3 4 3"
        />
        <text x="159" y="43" textAnchor="middle" className="holo-plane-dialogue" fill="var(--color-fg)">
          {balloonText}
        </text>
      </g>
    </svg>
  );
}

export function HologramSceneLayerArt(props: HologramSceneLayerArtProps): React.JSX.Element {
  if (props.scene.id === "arcane-library-rofan") {
    return <ArcaneLibraryPlane {...props} />;
  }
  if (props.scene.id === "murim-bamboo-forest") {
    return <MurimBambooPlane {...props} />;
  }
  return <NeonRooftopPlane {...props} />;
}
