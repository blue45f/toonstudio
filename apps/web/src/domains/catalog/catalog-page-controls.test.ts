// @vitest-environment jsdom
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';

const cssPath=['apps/web/src/domains/catalog/catalog-page-controls.css','src/domains/catalog/catalog-page-controls.css','catalog-page-controls.css'].map(p=>resolve(process.cwd(),p)).find(p=>existsSync(p));
const css=readFileSync(cssPath!, 'utf8');
describe('locale-independent rank cover target',()=>{
 it.each(['합성 작품 작품 상세','Synthetic story details'])('selects only the cover for %s',label=>{
  document.body.innerHTML=`<div class="ranking-page-layout"><div id="ranking-board"><div class="group/row"><div class="grid"><button>rank</button><a aria-label="${label}" href="/title/fixture">cover</a><a href="/title/fixture">title</a></div></div></div></div>`;
  const selector='.ranking-page-layout #ranking-board .group\\/row > .grid > a:first-of-type';
  const targets=document.querySelectorAll(selector);
  expect(targets).toHaveLength(1);expect(targets[0].textContent).toBe('cover');
  expect(css).toContain(selector);expect(css).not.toContain('aria-label');
 });
});
