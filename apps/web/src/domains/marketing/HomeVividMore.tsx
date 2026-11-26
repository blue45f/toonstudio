import { ArrowRight, ChevronRight } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { HomeCoreStudios } from "./HomeCoreStudios";
import { ReferenceEditorPreview } from "./ReferenceEditorPreview";
import { ServiceFlowNext } from "./public/intro-primitives";
import { HOME_EXAMPLES, HOME_LEARN_MORE, homeArt } from "./reference-home-content";

/** 상세 소개는 처음 펼칠 때 읽고, 닫아도 예시 편집 내용은 유지한다. */
export function HomeVividMore() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  return <>
        <section className="rd-examples" aria-labelledby="rd-examples-title">
          <div className="rd-examples-heading"><h2 id="rd-examples-title">{bi("예시 작품", "Example works")}</h2><Link href="/studio" className="min-h-11">{bi("내 프로젝트", "My projects")}<ChevronRight size={14} aria-hidden="true" /></Link></div>
          <div className="vivid-example-shelf">
            {HOME_EXAMPLES.slice(0, 3).map((example) => <figure className="vivid-example" key={example.image}>
              <img src={homeArt(example.image, 320)} alt="" width={320} height={240} decoding="async" loading="lazy" />
              <figcaption><strong>{bi(example.ko, example.en)}</strong><small>{bi("브랜드 예시 아트", "Illustrative brand artwork")}</small></figcaption>
            </figure>)}
          </div>
        </section>
        <HomeCoreStudios />
        <div data-ink="settle">
          <ReferenceEditorPreview />
        </div>
        <div className="rd-flow-next">
          <ServiceFlowNext current="home" title={bi("처음이라면 서비스 소개부터", "New here? Start with the introduction")} />
        </div>
        <nav className="rd-chapters" aria-label={bi("서비스 더 알아보기", "Learn more about ToonStudio")}>
          <span className="rd-chapters-label">{bi("더 알아보기", "Learn more")}</span>
          {HOME_LEARN_MORE.map((link) => (
            <Link key={link.href} href={link.href} className="ink-arrow min-h-11">
              {bi(link.ko, link.en)}
              <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
            </Link>
          ))}
        </nav>
  </>;
}
