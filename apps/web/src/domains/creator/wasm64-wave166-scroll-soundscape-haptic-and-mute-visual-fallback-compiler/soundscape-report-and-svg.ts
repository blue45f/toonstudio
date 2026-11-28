/**
 * Wave 166 — 순수 ES2017 FIPS 180-4 SHA-256 매니페스트 지문, 순수 OKLCH SVG 멀티트랙
 * 타임라인 감사 시각화, 자연스러운 한국어 사운드 디렉터 QA 브리핑 생성기.
 *
 * - 외부 crypto/DOM 의존성 0개 (동기식 순수 TypeScript)
 * - SVG 색상은 예외 없이 `oklch(...)`만 사용한다 (raw hex/rgb/hsl 금지).
 */

import { evaluateEqualPowerEnvelope } from './multitrack-scroll-sync-compiler'
import type {
  CompiledScrollSoundscape,
  SoundscapeAuditVerdict,
} from './soundscape-haptic-types'

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

const SHA256_INIT: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0
}

function encodeUtf8Bytes(text: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00)
        i += 1
      }
    }
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
    }
  }
  return bytes
}

/**
 * 순수 ES2017 동기식 FIPS 180-4 SHA-256 64자리 16진수 해시 계산.
 */
export function sha256SoundscapeHex(input: string): string {
  const msg = encodeUtf8Bytes(input)
  const bitLenHi = Math.floor((msg.length * 8) / 0x100000000) >>> 0
  const bitLenLo = (msg.length * 8) >>> 0

  msg.push(0x80)
  while (msg.length % 64 !== 56) {
    msg.push(0x00)
  }
  msg.push(
    (bitLenHi >>> 24) & 0xff,
    (bitLenHi >>> 16) & 0xff,
    (bitLenHi >>> 8) & 0xff,
    bitLenHi & 0xff,
    (bitLenLo >>> 24) & 0xff,
    (bitLenLo >>> 16) & 0xff,
    (bitLenLo >>> 8) & 0xff,
    bitLenLo & 0xff,
  )

  const h = [
    SHA256_INIT[0],
    SHA256_INIT[1],
    SHA256_INIT[2],
    SHA256_INIT[3],
    SHA256_INIT[4],
    SHA256_INIT[5],
    SHA256_INIT[6],
    SHA256_INIT[7],
  ]
  const w = new Array<number>(64)

  for (let offset = 0; offset < msg.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4
      w[i] =
        (((msg[idx] << 24) |
          (msg[idx + 1] << 16) |
          (msg[idx + 2] << 8) |
          msg[idx + 3]) >>>
          0)
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let a = h[0]
    let b = h[1]
    let c = h[2]
    let d = h[3]
    let e = h[4]
    let f = h[5]
    let g = h[6]
    let hh = h[7]

    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0
      const ch = ((e & f) ^ (~e & g)) >>> 0
      const temp1 = (hh + s1 + ch + SHA256_K[i] + w[i]) >>> 0
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
      const temp2 = (s0 + maj) >>> 0

      hh = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }

  return h.map((word) => word.toString(16).padStart(8, '0')).join('')
}

/**
 * 컴파일된 사운드스케이프·햅틱·시각 대체 매니페스트의 결정론적 SHA-256 지문 산출.
 * 임의 큐의 `startYpx`, 페이드, 음량, 햅틱, 시각 대체 변경 시 즉시 지문이 달라진다.
 */
export function computeSoundscapeManifestFingerprint(
  compiled: CompiledScrollSoundscape,
): string {
  const canonicalPayload = {
    schema: 'toonstudio.wave166.soundscape-haptic-manifest.v1',
    episodeId: compiled.episodeId,
    totalScrollHeightPx: compiled.totalScrollHeightPx,
    readerContext: compiled.readerContext,
    loudnessPolicy: compiled.loudnessPolicy,
    hapticPolicy: compiled.hapticPolicy,
    masterGainTrimDb: compiled.masterGainTrimDb,
    compiledPeakDbtp: compiled.compiledPeakDbtp,
    cues: compiled.compiledCues.map((c) => ({
      id: c.id,
      kind: c.kind,
      startYpx: c.anchor.startYpx,
      endYpx: c.anchor.endYpx,
      fadeInPx: c.anchor.fadeInPx,
      fadeOutPx: c.anchor.fadeOutPx,
      baseGainDb: c.baseGainDb,
      priority: c.priority,
      compiledGainTrimDb: c.compiledGainTrimDb,
      haptic: c.haptic ?? null,
    })),
    haptics: compiled.hapticReport.events.map((evt) => ({
      cueId: evt.cueId,
      triggerYpx: evt.triggerYpx,
      durationMs: evt.durationMs,
      intensity: evt.intensity,
      status: evt.status,
    })),
    visualFallbacks: compiled.muteVisualFallback.directives.map((d) => ({
      id: d.id,
      sourceCueId: d.sourceCueId,
      kind: d.kind,
      startYpx: d.startYpx,
      endYpx: d.endYpx,
      captionKo: d.captionKo,
      effectiveFlashHz: d.effectiveFlashHz,
    })),
  }

  return sha256SoundscapeHex(JSON.stringify(canonicalPayload))
}

export function escapeXmlText(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function safeCoord(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Number(value.toFixed(2))
}

const SVG_TOKENS = {
  canvasBg: 'oklch(0.98 0.01 85)',
  panelSurface: 'oklch(0.95 0.012 85)',
  cardSurface: 'oklch(0.995 0.004 85)',
  borderSubtle: 'oklch(0.84 0.018 145)',
  inkPrimary: 'oklch(0.24 0.03 155)',
  inkSecondary: 'oklch(0.46 0.025 155)',
  bgmCurveA: 'oklch(0.45 0.11 160)',
  bgmCurveB: 'oklch(0.50 0.12 245)',
  ambientFill: 'oklch(0.68 0.06 180 / 0.25)',
  ambientStroke: 'oklch(0.55 0.08 180)',
  foleyPin: 'oklch(0.56 0.17 28)',
  hapticActive: 'oklch(0.58 0.15 55)',
  hapticMuted: 'oklch(0.70 0.02 85)',
  badgePass: 'oklch(0.44 0.11 155)',
  badgeWarn: 'oklch(0.60 0.14 65)',
  badgeFail: 'oklch(0.52 0.18 25)',
  badgeTextLight: 'oklch(0.98 0.006 85)',
  meterTrack: 'oklch(0.90 0.014 85)',
  meterSafe: 'oklch(0.50 0.12 155)',
  meterWarn: 'oklch(0.62 0.15 55)',
  meterDanger: 'oklch(0.54 0.18 25)',
} as const

function verdictBadgeColor(verdict: SoundscapeAuditVerdict): string {
  if (verdict === 'PASS') {
    return SVG_TOKENS.badgePass
  }
  if (verdict === 'WARN') {
    return SVG_TOKENS.badgeWarn
  }
  return SVG_TOKENS.badgeFail
}

function playbackModeLabelKo(mode: CompiledScrollSoundscape['readerContext']['mode']): string {
  if (mode === 'muted-subway') {
    return '지하철 음소거'
  }
  if (mode === 'reduced-motion') {
    return '모션 축소'
  }
  if (mode === 'deaf-accessible') {
    return '청각 접근성'
  }
  return '오디오·햅틱 전체'
}

/**
 * 순수 `oklch(...)` SVG 멀티트랙 세로 스크롤 사운드스케이프 타임라인 시각화 생성.
 * - 세로 스크롤 좌표(`0px ~ totalScrollHeightPx`)를 가로 눈금자로 투영
 * - BGM/앰비언트 등전력 크로스페이드 곡선, 폴리 임팩트 핀, 햅틱 펄스 틱,
 *   트루 피크 헤드룸 바, 음소거 시각 대체 커버리지 배지를 한눈에 표시한다.
 */
export function renderScrollSoundscapeAuditSvg(
  compiled: CompiledScrollSoundscape,
  verdict: SoundscapeAuditVerdict,
  manifestFingerprintSha256: string,
): string {
  const width = 960
  const height = 460
  const leftMargin = 136
  const rightMargin = 28
  const plotWidth = width - leftMargin - rightMargin
  const scrollSpan = Math.max(1, compiled.totalScrollHeightPx)

  const mapYToX = (yPx: number): number => {
    const ratio = Math.max(0, Math.min(1, yPx / scrollSpan))
    return safeCoord(leftMargin + ratio * plotWidth, leftMargin)
  }

  const lines: string[] = []
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXmlText(`세로 스크롤 사운드스케이프 감사 타임라인: ${compiled.episodeTitleKo}`)}">`,
  )
  lines.push(
    `  <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="${SVG_TOKENS.canvasBg}" stroke="${SVG_TOKENS.borderSubtle}" stroke-width="1.2" />`,
  )

  // 헤더 영역
  const badgeColor = verdictBadgeColor(verdict)
  lines.push(
    `  <rect x="16" y="14" width="${width - 32}" height="52" rx="10" fill="${SVG_TOKENS.cardSurface}" stroke="${SVG_TOKENS.borderSubtle}" stroke-width="1" />`,
  )
  lines.push(
    `  <text x="30" y="38" fill="${SVG_TOKENS.inkPrimary}" font-size="15" font-weight="700" font-family="sans-serif">${escapeXmlText(compiled.episodeTitleKo)}</text>`,
  )
  lines.push(
    `  <text x="30" y="56" fill="${SVG_TOKENS.inkSecondary}" font-size="11" font-family="monospace">EP ${escapeXmlText(compiled.episodeId)} · 모드 ${escapeXmlText(playbackModeLabelKo(compiled.readerContext.mode))} · SHA256 ${escapeXmlText(manifestFingerprintSha256.slice(0, 12))}</text>`,
  )
  lines.push(
    `  <rect x="${width - 118}" y="25" width="88" height="28" rx="8" fill="${badgeColor}" />`,
  )
  lines.push(
    `  <text x="${width - 74}" y="44" text-anchor="middle" fill="${SVG_TOKENS.badgeTextLight}" font-size="12" font-weight="700" font-family="sans-serif">${escapeXmlText(verdict)}</text>`,
  )

  // 스크롤 눈금자 (세로 스크롤 px → 가로 축)
  const rulerY = 92
  lines.push(
    `  <line x1="${leftMargin}" y1="${rulerY}" x2="${width - rightMargin}" y2="${rulerY}" stroke="${SVG_TOKENS.borderSubtle}" stroke-width="1.2" />`,
  )
  lines.push(
    `  <text x="24" y="${rulerY + 4}" fill="${SVG_TOKENS.inkSecondary}" font-size="11" font-weight="600" font-family="sans-serif">스크롤 좌표</text>`,
  )

  const tickCount = 6
  for (let i = 0; i <= tickCount; i += 1) {
    const yVal = Math.round((scrollSpan * i) / tickCount)
    const xPos = mapYToX(yVal)
    lines.push(
      `  <line x1="${xPos}" y1="${rulerY - 4}" x2="${xPos}" y2="${rulerY + 286}" stroke="${SVG_TOKENS.borderSubtle}" stroke-width="0.7" stroke-dasharray="3 4" />`,
    )
    lines.push(
      `  <text x="${xPos}" y="${rulerY - 8}" text-anchor="middle" fill="${SVG_TOKENS.inkSecondary}" font-size="10" font-family="monospace">${yVal}px</text>`,
    )
  }

  // 레인 1: BGM / 앰비언트 등전력 크로스페이드 곡선
  const lane1Top = 104
  const lane1Height = 82
  const lane1Bottom = lane1Top + lane1Height - 10
  lines.push(
    `  <rect x="${leftMargin}" y="${lane1Top}" width="${plotWidth}" height="${lane1Height}" rx="8" fill="${SVG_TOKENS.panelSurface}" stroke="${SVG_TOKENS.borderSubtle}" stroke-width="0.9" />`,
  )
  lines.push(
    `  <text x="24" y="${lane1Top + 34}" fill="${SVG_TOKENS.inkPrimary}" font-size="11.5" font-weight="600" font-family="sans-serif">BGM·앰비언트</text>`,
  )
  lines.push(
    `  <text x="24" y="${lane1Top + 50}" fill="${SVG_TOKENS.inkSecondary}" font-size="10" font-family="sans-serif">등전력 크로스페이드</text>`,
  )

  let bgmIndex = 0
  for (const cue of compiled.compiledCues) {
    if (cue.kind !== 'bgm-motif' && cue.kind !== 'ambient-bed') {
      continue
    }
    const samples = 36
    const startY = Math.max(0, Math.min(cue.anchor.startYpx, cue.anchor.endYpx))
    const endY = Math.min(scrollSpan, Math.max(cue.anchor.startYpx, cue.anchor.endYpx))
    const span = Math.max(1, endY - startY)
    const pts: string[] = []
    for (let s = 0; s <= samples; s += 1) {
      const yCur = startY + (span * s) / samples
      const gain = evaluateEqualPowerEnvelope(cue.anchor, yCur)
      const px = mapYToX(yCur)
      const py = safeCoord(lane1Bottom - gain * (lane1Height - 24), lane1Bottom)
      pts.push(`${px},${py}`)
    }
    if (cue.kind === 'ambient-bed') {
      const xStart = mapYToX(startY)
      const xEnd = mapYToX(endY)
      const polygonPts = `${xStart},${lane1Bottom} ${pts.join(' ')} ${xEnd},${lane1Bottom}`
      lines.push(
        `  <polygon points="${polygonPts}" fill="${SVG_TOKENS.ambientFill}" stroke="${SVG_TOKENS.ambientStroke}" stroke-width="1.3" />`,
      )
    } else {
      const strokeColor = bgmIndex % 2 === 0 ? SVG_TOKENS.bgmCurveA : SVG_TOKENS.bgmCurveB
      bgmIndex += 1
      lines.push(
        `  <polyline points="${pts.join(' ')}" fill="none" stroke="${strokeColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`,
      )
      const labelX = mapYToX((startY + endY) / 2)
      lines.push(
        `  <text x="${labelX}" y="${lane1Top + 14}" text-anchor="middle" fill="${strokeColor}" font-size="9.5" font-weight="600" font-family="sans-serif">${escapeXmlText(cue.labelKo)}</text>`,
      )
    }
  }

  // 레인 2: 폴리(Foley) 임팩트 핀
  const lane2Top = 196
  const lane2Height = 52
  const lane2Mid = lane2Top + lane2Height / 2
  lines.push(
    `  <rect x="${leftMargin}" y="${lane2Top}" width="${plotWidth}" height="${lane2Height}" rx="8" fill="${SVG_TOKENS.cardSurface}" stroke="${SVG_TOKENS.borderSubtle}" stroke-width="0.9" />`,
  )
  lines.push(
    `  <text x="24" y="${lane2Top + 24}" fill="${SVG_TOKENS.inkPrimary}" font-size="11.5" font-weight="600" font-family="sans-serif">폴리 임팩트</text>`,
  )
  lines.push(
    `  <text x="24" y="${lane2Top + 39}" fill="${SVG_TOKENS.inkSecondary}" font-size="10" font-family="sans-serif">자동 덕킹 트리거</text>`,
  )

  for (const cue of compiled.compiledCues) {
    if (cue.kind !== 'foley-sfx') {
      continue
    }
    const pinX = mapYToX((cue.anchor.startYpx + cue.anchor.endYpx) / 2)
    lines.push(
      `  <line x1="${pinX}" y1="${lane2Top + 10}" x2="${pinX}" y2="${lane2Top + lane2Height - 8}" stroke="${SVG_TOKENS.foleyPin}" stroke-width="2" />`,
    )
    lines.push(
      `  <polygon points="${pinX},${lane2Mid - 7} ${safeCoord(pinX + 6)},${lane2Mid} ${pinX},${lane2Mid + 7} ${safeCoord(pinX - 6)},${lane2Mid}" fill="${SVG_TOKENS.foleyPin}" />`,
    )
    lines.push(
      `  <text x="${safeCoord(pinX + 9)}" y="${lane2Mid + 4}" fill="${SVG_TOKENS.inkPrimary}" font-size="9.5" font-family="sans-serif">${escapeXmlText(cue.labelKo)}</text>`,
    )
  }

  // 레인 3: 햅틱 펄스 틱
  const lane3Top = 258
  const lane3Height = 48
  lines.push(
    `  <rect x="${leftMargin}" y="${lane3Top}" width="${plotWidth}" height="${lane3Height}" rx="8" fill="${SVG_TOKENS.panelSurface}" stroke="${SVG_TOKENS.borderSubtle}" stroke-width="0.9" />`,
  )
  lines.push(
    `  <text x="24" y="${lane3Top + 22}" fill="${SVG_TOKENS.inkPrimary}" font-size="11.5" font-weight="600" font-family="sans-serif">진동 햅틱</text>`,
  )
  lines.push(
    `  <text x="24" y="${lane3Top + 37}" fill="${SVG_TOKENS.inkSecondary}" font-size="10" font-family="sans-serif">120ms · 25% 상한</text>`,
  )

  for (const evt of compiled.hapticReport.events) {
    const tickX = mapYToX(evt.triggerYpx)
    const isActive = evt.status === 'active'
    const barH = isActive ? Math.max(10, Math.round(evt.intensity * 28)) : 10
    const barY = safeCoord(lane3Top + lane3Height - 8 - barH)
    const fill = isActive ? SVG_TOKENS.hapticActive : SVG_TOKENS.hapticMuted
    lines.push(
      `  <rect x="${safeCoord(tickX - 3)}" y="${barY}" width="6" height="${barH}" rx="2" fill="${fill}" />`,
    )
  }

  // 레인 4: 음소거 시각 대체 커버리지 트랙
  const lane4Top = 316
  const lane4Height = 52
  lines.push(
    `  <rect x="${leftMargin}" y="${lane4Top}" width="${plotWidth}" height="${lane4Height}" rx="8" fill="${SVG_TOKENS.cardSurface}" stroke="${SVG_TOKENS.borderSubtle}" stroke-width="0.9" />`,
  )
  lines.push(
    `  <text x="24" y="${lane4Top + 24}" fill="${SVG_TOKENS.inkPrimary}" font-size="11.5" font-weight="600" font-family="sans-serif">음소거 시각 대체</text>`,
  )
  lines.push(
    `  <text x="24" y="${lane4Top + 39}" fill="${SVG_TOKENS.inkSecondary}" font-size="10" font-family="sans-serif">WCAG &lt;=3Hz 안전</text>`,
  )

  for (const directive of compiled.muteVisualFallback.directives) {
    const x1 = mapYToX(directive.startYpx)
    const x2 = mapYToX(directive.endYpx)
    const barW = Math.max(18, safeCoord(x2 - x1))
    lines.push(
      `  <rect x="${x1}" y="${lane4Top + 12}" width="${barW}" height="28" rx="6" fill="${directive.accentOklch}" opacity="0.28" stroke="${directive.accentOklch}" stroke-width="1.2" />`,
    )
    lines.push(
      `  <text x="${safeCoord(x1 + 6)}" y="${lane4Top + 30}" fill="${SVG_TOKENS.inkPrimary}" font-size="9.5" font-family="sans-serif">${escapeXmlText(directive.captionKo.slice(0, 14))}</text>`,
    )
  }

  // 하단 텔레메트리 스트립: 트루 피크 헤드룸 바 + 음소거 대체 커버리지 배지
  const footerTop = 384
  lines.push(
    `  <rect x="16" y="${footerTop}" width="${width - 32}" height="60" rx="10" fill="${SVG_TOKENS.cardSurface}" stroke="${SVG_TOKENS.borderSubtle}" stroke-width="1" />`,
  )

  const meterX = 32
  const meterY = footerTop + 32
  const meterW = 360
  const normalizedPeak = Math.max(
    0,
    Math.min(1, (compiled.compiledPeakDbtp + 36) / 36),
  )
  const fillW = safeCoord(meterW * normalizedPeak)
  const meterColor =
    compiled.clippingViolationCount > 0
      ? SVG_TOKENS.meterDanger
      : compiled.compiledPeakDbtp > -2.5
        ? SVG_TOKENS.meterWarn
        : SVG_TOKENS.meterSafe
  const ceilingX = safeCoord(meterX + meterW * ((-1.0 + 36) / 36))

  lines.push(
    `  <text x="${meterX}" y="${footerTop + 21}" fill="${SVG_TOKENS.inkPrimary}" font-size="11" font-weight="600" font-family="sans-serif">트루 피크 헤드룸: ${safeCoord(compiled.compiledPeakDbtp)} dBTP (상한 -1.0 dBTP · 트림 ${safeCoord(compiled.masterGainTrimDb)} dB)</text>`,
  )
  lines.push(
    `  <rect x="${meterX}" y="${meterY}" width="${meterW}" height="14" rx="5" fill="${SVG_TOKENS.meterTrack}" />`,
  )
  lines.push(
    `  <rect x="${meterX}" y="${meterY}" width="${fillW}" height="14" rx="5" fill="${meterColor}" />`,
  )
  lines.push(
    `  <line x1="${ceilingX}" y1="${meterY - 3}" x2="${ceilingX}" y2="${meterY + 17}" stroke="${SVG_TOKENS.badgeFail}" stroke-width="1.5" />`,
  )

  const coveragePct = Math.round(compiled.muteVisualFallback.fallbackCoverageRatio * 100)
  const covBadgeColor =
    coveragePct === 100 && compiled.muteVisualFallback.wcagFlashSafe
      ? SVG_TOKENS.badgePass
      : SVG_TOKENS.badgeFail

  lines.push(
    `  <rect x="424" y="${footerTop + 14}" width="248" height="32" rx="8" fill="${covBadgeColor}" />`,
  )
  lines.push(
    `  <text x="548" y="${footerTop + 34}" text-anchor="middle" fill="${SVG_TOKENS.badgeTextLight}" font-size="11.5" font-weight="700" font-family="sans-serif">음소거 시각 대체 ${coveragePct}% · 최대 ${safeCoord(compiled.muteVisualFallback.maxEffectiveFlashHz)} Hz</text>`,
  )

  const dutyPct = safeCoord(compiled.hapticReport.peakDutyCycleRatioAfter * 100)
  lines.push(
    `  <text x="692" y="${footerTop + 26}" fill="${SVG_TOKENS.inkPrimary}" font-size="11" font-weight="600" font-family="sans-serif">활성 햅틱 ${compiled.hapticReport.activePulseCount}회 · 듀티 ${dutyPct}%</text>`,
  )
  lines.push(
    `  <text x="692" y="${footerTop + 44}" fill="${SVG_TOKENS.inkSecondary}" font-size="10.5" font-family="sans-serif">동시 발음 ${compiled.maxObservedPolyphonyAfter}/${compiled.loudnessPolicy.maxPolyphony} · 크로스페이드 ${compiled.equalPowerCrossfadeCount}구간</text>`,
  )

  lines.push('</svg>')
  return lines.join('\n')
}

/**
 * 자연스러운 한국어 사운드 디렉터 QA 요약 보고서 생성 (번역투 배제).
 */
export function summarizeScrollSoundscapeKo(
  compiled: CompiledScrollSoundscape,
  verdict: SoundscapeAuditVerdict,
  manifestFingerprintSha256: string,
): string {
  const coveragePct = Math.round(compiled.muteVisualFallback.fallbackCoverageRatio * 100)
  const dutyPct = (compiled.hapticReport.peakDutyCycleRatioAfter * 100).toFixed(1)

  const verdictLine =
    verdict === 'PASS'
      ? `[PASS] ${compiled.episodeTitleKo} 사운드·햅틱·음소거 시각 대체 컴파일 통과`
      : verdict === 'WARN'
        ? `[WARN] ${compiled.episodeTitleKo} 안전 기준은 맞췄으나 보호 조정이 개입돼 사운드 디렉터 확인 필요`
        : `[FAIL] ${compiled.episodeTitleKo} 배포 전 해결해야 할 사운드·접근성 위반 항목 존재`

  const audioLine = `오디오: 최종 트루 피크 ${compiled.compiledPeakDbtp.toFixed(2)} dBTP(클리핑 ${compiled.clippingViolationCount}건), 추정 통합 음량 ${compiled.estimatedIntegratedLufs.toFixed(1)} LUFS, 마스터 트림 ${compiled.masterGainTrimDb.toFixed(2)} dB, 최대 동시 발음 ${compiled.maxObservedPolyphonyAfter}/${compiled.loudnessPolicy.maxPolyphony}트랙, 등전력 크로스페이드 ${compiled.equalPowerCrossfadeCount}구간, 폴리 자동 덕킹 ${compiled.duckingTriggeredCount}지점 적용.`

  const hapticLine = compiled.hapticReport.reducedMotionDisabled
    ? '햅틱: 독자 모션 축소 설정에 따라 진동 펄스를 전부 해제(0회)했습니다.'
    : `햅틱: 활성 펄스 ${compiled.hapticReport.activePulseCount}회(병합·억제 ${compiled.hapticReport.throttledOrMergedCount}건), 최소 간격 위반 ${compiled.hapticReport.minSpacingViolationsAfter}건, 최대 듀티 사이클 ${dutyPct}%로 안전 상한(25%) 이내입니다.`

  const visualLine = `음소거 시각 대체: 필수 연출 ${compiled.muteVisualFallback.coveredSourceCueIds.length}/${compiled.muteVisualFallback.requiredSourceCueIds.length}건(${coveragePct}%) 모두 한국어 시각 단서로 변환했으며 최대 점멸 속도는 ${compiled.muteVisualFallback.maxEffectiveFlashHz.toFixed(1)} Hz(WCAG 2.3.1 3.0 Hz 이하)입니다.`

  const warningFindings = compiled.findings.filter((f) => f.severity !== 'info')
  const actionBlock =
    warningFindings.length > 0
      ? `\n점검 메모:\n${warningFindings.map((f) => `- [${f.severity.toUpperCase()}] ${f.messageKo}`).join('\n')}`
      : ''

  return [
    verdictLine,
    audioLine,
    hapticLine,
    visualLine,
    `매니페스트 지문(SHA-256): ${manifestFingerprintSha256.slice(0, 16)}`,
  ].join('\n') + actionBlock
}
