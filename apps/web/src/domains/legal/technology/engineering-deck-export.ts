import type { EngineeringCodeLanguage } from "./engineering-atlas-types";
import { CODE_LANGUAGE_LABEL, tokenizeCode } from "./engineering-code-highlight";
import type { DeckAtlas } from "./engineering-deck-atlas";
import { DECK_SITE_HOST, absoluteDeckUrl, buildQrSvgModel, qrSvgMarkup } from "./engineering-deck-qr";
import type { EngineeringDiagram } from "./engineering-diagram-types";
import { ENGINEERING_STATUS_META, type EngineeringStatus, type LocalizedText } from "./engineering-story-content";

/**
 * 네트워크 없이 여는 발표 백업(단일 HTML). 서비스의 오프라인 복제본이 아니다.
 * - 외부 스크립트·폰트·이미지·영상을 포함하지 않는다(인라인 스크립트 1개만). 링크와 QR 은 글자·인라인 SVG 로만 보인다.
 * - 모든 콘텐츠 문자열은 이스케이프한다.
 * - 본문이 있는 슬라이드는 본문을 모두 담는다: 모듈·데모 단계·수치·링크·상태·표·도식(글)·도감 카드(코드 포함)·QR.
 * - 이 파일은 앱 밖에서 열리므로 테마 토큰을 쓸 수 없어, 스타라이트 팔레트를 파일 안 변수로 고정한다.
 */

export interface ExportableDeckSlide {
  readonly id: string;
  readonly layout?: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly lead: string;
  readonly points: readonly string[];
  readonly notes: string;
  readonly flow?: readonly string[];
  readonly stack?: readonly string[];
  readonly question?: string;
  readonly status?: EngineeringStatus;
  readonly facts?: readonly { readonly value: string; readonly label: string }[];
  readonly modules?: readonly {
    readonly title: string;
    readonly body: string;
    readonly href?: string;
    readonly stack?: readonly string[];
  }[];
  readonly demoSteps?: readonly {
    readonly href: string;
    readonly action: string;
    readonly expected: string;
    readonly fallback: string;
  }[];
  readonly links?: readonly { readonly href: string; readonly label: string }[];
  readonly statusChips?: readonly { readonly title: string; readonly status: EngineeringStatus }[];
  readonly table?: {
    readonly columns: readonly string[];
    readonly rows: readonly (readonly string[])[];
    readonly caption?: string;
  };
  readonly diagram?: EngineeringDiagram;
  readonly atlas?: DeckAtlas;
  readonly qr?: { readonly href: string; readonly label: string };
}

export interface OfflineDeckOptions {
  /** 도식(LocalizedText)을 글로 바꿀 때 쓰는 번역 함수. 없으면 `locale`이 ko 인지에 따라 고른다. */
  readonly localize?: (text: LocalizedText) => string;
  /** `agenda` 레이아웃 슬라이드에 시간표로 보여 줄 구간. */
  readonly sections?: readonly { readonly order: number; readonly title: string; readonly seconds: number }[];
  /** 기본 아키텍처 도식(`diagram` 레이아웃에 `diagram`이 없을 때)의 글 개요. */
  readonly architecture?: {
    readonly zones: readonly {
      readonly title: string;
      readonly caption?: string;
      readonly boxes: readonly { readonly title: string; readonly detail: string }[];
    }[];
    readonly notes: readonly string[];
  };
  /** 첫 슬라이드 앞에 보여 줄 범위 안내(예: 부록 트랙의 "이 카테고리만 포함"). */
  readonly scopeNote?: string;
}

function escapeDeckHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const OFFLINE_DECK_STYLE = `
:root{--bg:#070a14;--panel:#0b101d;--card:#101726;--raised:#192235;--line:#303b54;--fg:#f1f4ff;--fg2:#c5cede;--fg3:#a5b3c9;--accent:#b39bff;--accent2:#6edaff;--good:#7ee0a4;--warn:#f1c97a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1200px;margin:auto;padding:clamp(20px,4vw,56px)}
article[hidden]{display:none}
header{display:flex;flex-wrap:wrap;gap:10px;align-items:center;color:var(--accent2);font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.badge{padding:2px 10px;border:1px solid currentColor;border-radius:999px;font-size:12px;letter-spacing:.02em;text-transform:none}
.badge[data-status="live"]{color:var(--good)}.badge[data-status="configured"]{color:var(--accent)}.badge[data-status="experimental"]{color:var(--warn)}
h1{margin:14px 0 0;font-size:clamp(28px,4.4vw,54px);line-height:1.18;word-break:keep-all}
h2{margin:26px 0 8px;color:var(--accent2);font-size:14px;letter-spacing:.08em;text-transform:uppercase}
.lead{color:var(--fg2);font-weight:600;font-size:clamp(17px,2vw,24px);line-height:1.6;word-break:keep-all}
ol,ul{display:grid;gap:10px;padding:0;list-style:none}
ol.points{counter-reset:p}
ol.points>li{counter-increment:p}
li{padding:12px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card);font-size:clamp(16px,1.8vw,21px);line-height:1.55;word-break:keep-all}
ol.points>li::before{content:counter(p);display:inline-grid;place-items:center;width:1.6em;height:1.6em;margin-right:10px;border-radius:50%;background:rgba(179,155,255,.2);color:var(--accent);font-weight:800;font-size:.8em}
.flow{color:var(--fg);font-weight:700}
.tech{color:var(--fg3);font-size:14px}
.grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.cols{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.cols>div{padding:12px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.cols>div>strong,.cols>div>small{display:block}
.cols>div>small{margin:2px 0 10px;color:var(--fg3);font-size:14px}
dl{display:grid;gap:10px;margin:0;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
dl>div{padding:10px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
dt{color:var(--fg3);font-size:14px}dd{margin:0;color:var(--accent2);font-size:26px;font-weight:800}dd.src{font-size:12px;font-weight:500;color:var(--fg3)}
li strong,li em{display:block}
li em{margin-top:4px;color:var(--fg3);font-size:14px;font-style:normal}
li small{display:block;margin-top:4px;color:var(--fg3);font-size:14px}
code{padding:1px 6px;border-radius:6px;background:var(--raised);color:var(--fg2);font:13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all}
pre{overflow:auto;margin:10px 0;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--raised);font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,"Noto Sans Mono CJK KR",monospace;tab-size:2}
pre code{padding:0;background:none;font:inherit;word-break:normal}
.t-comment{color:var(--fg3);font-style:italic}.t-string{color:#9be3b0}.t-number{color:#f1c97a}.t-keyword{color:var(--accent);font-weight:700}.t-type{color:var(--accent2)}.t-function{color:#8fb8ff}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:clamp(14px,1.5vw,18px)}
caption{padding:8px 0;color:var(--fg3);text-align:left;caption-side:bottom;font-size:14px}
th,td{padding:8px 12px;border:1px solid var(--line);text-align:left;vertical-align:top}
thead th{background:var(--raised);color:var(--accent2)}tbody th{color:var(--fg)}
figure{margin:14px 0;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
figure.qr svg{display:block;width:min(260px,100%);height:auto;border-radius:10px}
figcaption{color:var(--fg2);font-weight:700}
.alt{color:var(--fg2);font-size:15px;line-height:1.6}
.note{margin:12px 0;padding:10px 14px;border-left:4px solid var(--accent2);border-radius:8px;background:var(--card);color:var(--fg2);font-size:14px}
details{border-top:1px solid var(--line);margin-top:24px;padding:16px 0;color:var(--fg2)}
summary{cursor:pointer;min-height:44px;display:flex;align-items:center}
.notes{white-space:pre-line;font-size:18px;line-height:1.7}
nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap;position:sticky;bottom:0;padding:14px 16px;background:var(--panel);border-top:1px solid var(--line)}
button,select{font:inherit;min-height:44px;padding:8px 16px;max-width:100%;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg)}
nav label{display:flex;align-items:center;gap:8px;min-width:0;max-width:100%}
nav select{min-width:0;flex:1 1 auto;text-overflow:ellipsis}
button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid var(--accent2);outline-offset:3px}
footer{font-size:13px;padding:12px 24px;color:var(--fg3)}
@media print{body{background:#fff;color:#111}article[hidden],article{display:block;break-after:page}nav,footer,details{display:none}main{padding:0}li,figure,dl>div,.cols>div,.note{background:none;border-color:#999}pre{background:#f4f4f6;color:#111;white-space:pre-wrap;overflow:visible;border-color:#999}code{background:#eee;color:#111}h1,h2,header,dd,thead th,.t-keyword,.t-type,.t-function{color:#111}.lead,figcaption,.alt,.note,dt,dd.src,li em,li small,caption,.tech{color:#333}.t-comment{color:#555}.t-string{color:#165a2c}.t-number{color:#7a4a00}table,th,td{border-color:#999}thead th{background:#eee}ol.points>li::before{background:#ddd;color:#111}}
`;

const OFFLINE_DECK_SCRIPT = `(()=>{const slides=[...document.querySelectorAll('[data-slide]')];const prev=document.getElementById('prev');const next=document.getElementById('next');const jump=document.getElementById('jump');const status=document.getElementById('status');let index=0;function show(value){index=Math.max(0,Math.min(slides.length-1,value));slides.forEach((slide,i)=>{slide.hidden=i!==index});prev.disabled=index===0;next.disabled=index===slides.length-1;jump.value=String(index);status.textContent=(index+1)+' / '+slides.length;}function notes(){const d=slides[index].querySelector('details');if(d)d.open=!d.open;}prev.onclick=()=>show(index-1);next.onclick=()=>show(index+1);jump.onchange=()=>show(Number(jump.value));document.addEventListener('keydown',event=>{if(event.altKey||event.ctrlKey||event.metaKey||event.target.closest?.('button,select,input,textarea,summary,a,[contenteditable]'))return;const moves={ArrowRight:index+1,PageDown:index+1,' ':index+1,ArrowLeft:index-1,PageUp:index-1,Home:0,End:slides.length-1};if(Object.prototype.hasOwnProperty.call(moves,event.key)){event.preventDefault();show(moves[event.key]);return;}const key=event.key.toLowerCase();if(key==='n'||key==='s'){notes();}else if(key==='f'&&document.documentElement.requestFullscreen){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{});}});show(0);})();`;

interface Labels {
  readonly ko: boolean;
  readonly agenda: string;
  readonly status: string;
  readonly facts: string;
  readonly modules: string;
  readonly demo: string;
  readonly observe: string;
  readonly fallback: string;
  readonly diagram: string;
  readonly components: string;
  readonly connections: string;
  readonly keyPoints: string;
  readonly code: string;
  readonly usage: string;
  readonly files: string;
  readonly links: string;
  readonly source: string;
  readonly qr: string;
  readonly route: string;
}

function labelsFor(ko: boolean): Labels {
  return {
    ko,
    agenda: ko ? "구간 시간표" : "Section schedule",
    status: ko ? "현재 상태" : "Current status",
    facts: ko ? "핵심 수치" : "Key figures",
    modules: ko ? "작업 공간" : "Workspaces",
    demo: ko ? "데모 단계" : "Demo steps",
    observe: ko ? "관찰" : "Observe",
    fallback: ko ? "실패 시" : "If it fails",
    diagram: ko ? "도식(글로 보기)" : "Diagram (as text)",
    components: ko ? "구성 요소" : "Components",
    connections: ko ? "연결·순서" : "Connections and order",
    keyPoints: ko ? "핵심 요점" : "Key points",
    code: ko ? "코드" : "Code",
    usage: ko ? "서비스에서 쓰인 곳" : "Where it is used",
    files: ko ? "근거 파일" : "Source files",
    links: ko ? "링크" : "Links",
    source: ko ? "단순화 전 원본" : "Simplified from",
    qr: ko ? "QR 코드" : "QR code",
    route: ko ? "제품 경로" : "Product route",
  };
}

function clock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/** 도식 명세를 글로 풀어 쓴다: 구성 요소 목록과 연결·순서 목록. 도식을 그릴 수 없는 오프라인 발표본에서 쓴다. */
export function describeDiagramAsText(
  diagram: EngineeringDiagram,
  text: (value: LocalizedText) => string,
): { readonly components: readonly string[]; readonly connections: readonly string[] } {
  if (diagram.kind === "graph") {
    const ordered = [...diagram.nodes].sort((a, b) => a.at[1] - b.at[1] || a.at[0] - b.at[0]);
    const labelOf = new Map(diagram.nodes.map((node) => [node.id, text(node.label)]));
    return {
      components: ordered.map((node) => (node.sub ? `${text(node.label)} — ${text(node.sub)}` : text(node.label))),
      connections: diagram.edges.map((edge) => {
        const arrow = edge.both ? "↔" : "→";
        const label = edge.label ? ` (${text(edge.label)})` : "";
        return `${labelOf.get(edge.from) ?? edge.from} ${arrow} ${labelOf.get(edge.to) ?? edge.to}${label}`;
      }),
    };
  }
  if (diagram.kind === "sequence") {
    const labelOf = new Map(diagram.actors.map((actor) => [actor.id, text(actor.label)]));
    return {
      components: diagram.actors.map((actor) => (actor.sub ? `${text(actor.label)} — ${text(actor.sub)}` : text(actor.label))),
      connections: diagram.messages.map((message, index) => {
        const note = message.note ? ` · ${text(message.note)}` : "";
        return `${index + 1}. ${labelOf.get(message.from) ?? message.from} → ${labelOf.get(message.to) ?? message.to}: ${text(message.label)}${note}`;
      }),
    };
  }
  const labelOf = new Map(diagram.layers.map((layer) => [layer.id, text(layer.label)]));
  return {
    components: diagram.layers.map((layer) => {
      const detail = [layer.sub ? text(layer.sub) : "", ...(layer.chips ?? [])].filter(Boolean).join(" · ");
      return detail ? `${text(layer.label)} — ${detail}` : text(layer.label);
    }),
    connections: (diagram.brackets ?? []).map(
      (bracket) => `${text(bracket.label)}: ${bracket.layerIds.map((id) => labelOf.get(id) ?? id).join(", ")}`,
    ),
  };
}

function list(items: readonly string[], className?: string): string {
  if (items.length === 0) return "";
  return `<ul${className ? ` class="${className}"` : ""}>${items.map((item) => `<li>${escapeDeckHtml(item)}</li>`).join("")}</ul>`;
}

function diagramBlock(diagram: EngineeringDiagram, text: (value: LocalizedText) => string, labels: Labels): string {
  const outline = describeDiagramAsText(diagram, text);
  return `<figure><figcaption>${escapeDeckHtml(text(diagram.title))} — ${escapeDeckHtml(text(diagram.caption))}</figcaption>
    <p class="alt">${escapeDeckHtml(text(diagram.alt))}</p>
    <h2>${escapeDeckHtml(labels.components)}</h2>${list(outline.components)}
    ${outline.connections.length ? `<h2>${escapeDeckHtml(labels.connections)}</h2>${list(outline.connections)}` : ""}</figure>`;
}

function codeBlock(code: string, language: EngineeringCodeLanguage): string {
  const lines = tokenizeCode(code, language)
    .map((line) => line.map((token) => (token.kind === "plain" || token.kind === "punct" || token.kind === "property"
      ? escapeDeckHtml(token.text)
      : `<span class="t-${token.kind}">${escapeDeckHtml(token.text)}</span>`)).join(""))
    .join("\n");
  return `<pre tabindex="0"><code>${lines}</code></pre>`;
}

function atlasBlock(slide: ExportableDeckSlide, atlas: DeckAtlas, text: (value: LocalizedText) => string, labels: Labels): string {
  if (atlas.view === "diagram") {
    return `${atlas.diagram ? diagramBlock(atlas.diagram, text, labels) : ""}
    ${slide.points.length === 0 && atlas.keyPoints.length ? `<h2>${escapeDeckHtml(labels.keyPoints)}</h2><ol class="points">${atlas.keyPoints.map((point) => `<li>${escapeDeckHtml(point)}</li>`).join("")}</ol>` : ""}`;
  }
  if (atlas.view === "code" && atlas.code) {
    const code = atlas.code;
    return `<h2>${escapeDeckHtml(labels.code)} ${code.index + 1}/${code.count} · ${escapeDeckHtml(CODE_LANGUAGE_LABEL[code.language])}</h2>
    ${codeBlock(code.code, code.language)}
    <p class="alt">${escapeDeckHtml(code.explain)}</p>
    ${code.source ? `<p class="note">${escapeDeckHtml(labels.source)}: <code>${escapeDeckHtml(code.source)}</code></p>` : ""}`;
  }
  const usage = atlas.usage ?? [];
  return `<h2>${escapeDeckHtml(labels.usage)}</h2>
    <ul class="grid">${usage.map((item) => `<li><strong>${escapeDeckHtml(item.feature)}</strong>${escapeDeckHtml(item.role)}<em>${[...item.paths.map((path) => `<code>${escapeDeckHtml(path)}</code>`), ...(item.route ? [`${escapeDeckHtml(labels.route)} <code>${escapeDeckHtml(item.route)}</code>`] : [])].join(" ")}</em></li>`).join("")}</ul>
    ${atlas.facts?.length ? `<h2>${escapeDeckHtml(labels.facts)}</h2><dl>${atlas.facts.map((fact) => `<div><dt>${escapeDeckHtml(fact.label)}</dt><dd>${escapeDeckHtml(fact.value)}</dd><dd class="src">${escapeDeckHtml(fact.source)}</dd></div>`).join("")}</dl>` : ""}
    ${atlas.links?.length ? `<h2>${escapeDeckHtml(labels.links)}</h2><ul>${atlas.links.map((link) => `<li><strong>${escapeDeckHtml(link.title)}</strong><em>${escapeDeckHtml(link.kind)} · <code>${escapeDeckHtml(link.url)}</code></em></li>`).join("")}</ul>` : ""}`;
}

function qrBlock(qr: NonNullable<ExportableDeckSlide["qr"]>, labels: Labels): string {
  const url = absoluteDeckUrl(qr.href);
  const model = url ? buildQrSvgModel(url) : null;
  const shown = url ?? qr.href;
  const svg = model ? qrSvgMarkup(model, `${labels.qr}: ${qr.label}`) : "";
  return `<figure class="qr">${svg}<figcaption>${escapeDeckHtml(qr.label)}</figcaption><p><code>${escapeDeckHtml(shown)}</code></p></figure>`;
}

function bodyBlocks(slide: ExportableDeckSlide, options: OfflineDeckOptions, text: (value: LocalizedText) => string, labels: Labels): string {
  const blocks: string[] = [];

  if (slide.layout === "agenda" && options.sections?.length) {
    blocks.push(`<h2>${escapeDeckHtml(labels.agenda)}</h2><ol class="grid">${options.sections.map((section) => `<li><strong>${String(section.order).padStart(2, "0")} · ${escapeDeckHtml(section.title)}</strong><em>${clock(section.seconds)}</em></li>`).join("")}</ol>`);
  }

  if (slide.statusChips?.length) {
    blocks.push(`<h2>${escapeDeckHtml(labels.status)}</h2><ul class="grid">${slide.statusChips.map((chip) => {
      const meta = ENGINEERING_STATUS_META[chip.status];
      return `<li><strong>${escapeDeckHtml(chip.title)}</strong><em>${escapeDeckHtml(labels.ko ? meta.label.ko : meta.label.en)}</em></li>`;
    }).join("")}</ul>`);
  }

  if (slide.facts?.length) {
    blocks.push(`<h2>${escapeDeckHtml(labels.facts)}</h2><dl>${slide.facts.map((fact) => `<div><dt>${escapeDeckHtml(fact.label)}</dt><dd>${escapeDeckHtml(fact.value)}</dd></div>`).join("")}</dl>`);
  }

  if (slide.modules?.length) {
    blocks.push(`<h2>${escapeDeckHtml(labels.modules)}</h2><ul class="grid">${slide.modules.map((module) => `<li><strong>${escapeDeckHtml(module.title)}</strong>${escapeDeckHtml(module.body)}${module.href ? `<em><code>${escapeDeckHtml(module.href)}</code></em>` : ""}${module.stack?.length ? `<small>${module.stack.map(escapeDeckHtml).join(" · ")}</small>` : ""}</li>`).join("")}</ul>`);
  }

  if (slide.demoSteps?.length) {
    blocks.push(`<h2>${escapeDeckHtml(labels.demo)}</h2><ol class="points grid">${slide.demoSteps.map((step) => `<li><strong>${escapeDeckHtml(step.action)}</strong>${escapeDeckHtml(labels.observe)}: ${escapeDeckHtml(step.expected)}<small>${escapeDeckHtml(labels.fallback)}: ${escapeDeckHtml(step.fallback)}</small><em><code>${escapeDeckHtml(step.href)}</code></em></li>`).join("")}</ol>`);
  }

  if (slide.layout === "diagram" && !slide.diagram && options.architecture) {
    const architecture = options.architecture;
    blocks.push(`<h2>${escapeDeckHtml(labels.diagram)}</h2><div class="cols">${architecture.zones.map((zone) => `<div><strong>${escapeDeckHtml(zone.title)}</strong>${zone.caption ? `<small>${escapeDeckHtml(zone.caption)}</small>` : ""}${list(zone.boxes.map((box) => `${box.title} — ${box.detail}`))}</div>`).join("")}</div>${architecture.notes.map((note) => `<p class="note">${escapeDeckHtml(note)}</p>`).join("")}`);
  }

  if (slide.diagram) blocks.push(diagramBlock(slide.diagram, text, labels));

  if (slide.table) {
    const table = slide.table;
    blocks.push(`<table>${table.caption ? `<caption>${escapeDeckHtml(table.caption)}</caption>` : ""}<thead><tr>${table.columns.map((column) => `<th scope="col">${escapeDeckHtml(column)}</th>`).join("")}</tr></thead><tbody>${table.rows.map((row) => `<tr>${row.map((cell, index) => (index === 0 ? `<th scope="row">${escapeDeckHtml(cell)}</th>` : `<td>${escapeDeckHtml(cell)}</td>`)).join("")}</tr>`).join("")}</tbody></table>`);
  }

  if (slide.atlas) blocks.push(atlasBlock(slide, slide.atlas, text, labels));

  if (slide.links?.length) {
    blocks.push(`<h2>${escapeDeckHtml(labels.links)}</h2><ul class="grid">${slide.links.map((link) => `<li><strong>${escapeDeckHtml(link.label)}</strong><em><code>${escapeDeckHtml(`${DECK_SITE_HOST}${link.href}`)}</code></em></li>`).join("")}</ul>`);
  }

  if (slide.qr) blocks.push(qrBlock(slide.qr, labels));
  return blocks.join("\n    ");
}

export function buildOfflineEngineeringDeck(slides: readonly ExportableDeckSlide[], locale: string, options: OfflineDeckOptions = {}): string {
  const ko = locale.startsWith("ko");
  const labels = labelsFor(ko);
  const text = options.localize ?? ((value: LocalizedText): string => (ko ? value.ko : value.en));
  const label = ko
    ? "오프라인 발표 백업 · 외부 영상과 서비스는 포함하지 않습니다."
    : "Offline presentation backup · External media and services are not included.";
  const shortcuts = ko ? "← → · Space · Home · End · N 노트 · F 전체 화면" : "← → · Space · Home · End · N notes · F fullscreen";
  const cards = slides.map((slide, index) => {
    const status = slide.status
      ? `<span class="badge" data-status="${escapeDeckHtml(slide.status)}">${escapeDeckHtml(ko ? ENGINEERING_STATUS_META[slide.status].label.ko : ENGINEERING_STATUS_META[slide.status].label.en)}</span>`
      : "";
    return `<article data-slide${index ? " hidden" : ""}>
    <header>${escapeDeckHtml(slide.eyebrow)} · ${index + 1}/${slides.length}${status}</header>
    ${index === 0 && options.scopeNote ? `<p class="note">${escapeDeckHtml(options.scopeNote)}</p>` : ""}
    <h1>${escapeDeckHtml(slide.title)}</h1><p class="lead">${escapeDeckHtml(slide.lead)}</p>
    ${slide.points.length ? `<ol class="points">${slide.points.map((point) => `<li>${escapeDeckHtml(point)}</li>`).join("")}</ol>` : ""}
    ${slide.flow?.length ? `<p class="flow">${slide.flow.map(escapeDeckHtml).join(" → ")}</p>` : ""}
    ${bodyBlocks(slide, options, text, labels)}
    ${slide.stack?.length ? `<p class="tech">${slide.stack.map(escapeDeckHtml).join(" · ")}</p>` : ""}
    <details><summary>${ko ? "발표자 노트 · 청중 화면에서는 닫아두세요" : "Speaker notes · Keep closed on the audience screen"}</summary><p class="notes">${escapeDeckHtml(slide.notes)}</p>${slide.question ? `<p>${escapeDeckHtml(slide.question)}</p>` : ""}</details>
  </article>`;
  }).join("\n");
  const options_ = slides.map((slide, index) => `<option value="${index}">${index + 1}. ${escapeDeckHtml(slide.title)}</option>`).join("");
  return `<!doctype html><html lang="${escapeDeckHtml(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="dark"><title>ToonStudio · ${ko ? "오프라인 기술 발표" : "Offline engineering presentation"}</title>
<style>${OFFLINE_DECK_STYLE}</style></head><body><main>${cards}</main>
<nav aria-label="${ko ? "발표 조작" : "Presentation controls"}"><button id="prev">${ko ? "이전" : "Previous"}</button><button id="next">${ko ? "다음" : "Next"}</button><label>${ko ? "슬라이드" : "Slide"} <select id="jump">${options_}</select></label><span id="status" role="status"></span></nav><footer>${label} ${shortcuts}</footer>
<script>${OFFLINE_DECK_SCRIPT}</script></body></html>`;
}

export function downloadOfflineEngineeringDeck(html: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
