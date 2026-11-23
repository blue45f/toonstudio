import { chromium } from 'playwright';
import { createRepairMock } from './repair-mock.mjs';
import { prepareDrawing } from './helpers.mjs';
import { runScenario } from './conduct.mjs';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';

const base = process.env.QA_RESULTS_DIR || join(process.cwd(), '.qa', 'alt-text-json-repair');
const origin = 'http://127.0.0.1:47631';
const managed = '/api/studio-ai/messages';
const mode = process.argv[2];
assert.ok(['cancel','success','stop'].includes(mode));
const mobile = mode !== 'cancel';
const device = mobile ? 'mobile' : 'desktop';
const tag = process.argv[3] || 'run1';
assert.match(tag,/^run[0-9]+$/);
const root = join(base,tag,mode);
mkdirSync(root, {recursive:true});
const events = [];
function record(event, data = {}) {
  const item = {time:new Date().toISOString(), event, data};
  events.push(item);
  appendFileSync(join(root,'events.jsonl'),JSON.stringify(item)+'\n');
  console.log(event, JSON.stringify(data).slice(0,450));
}
const unknown = new Map();
const deniedApi = new Map();
const failures = new Map();
const responses = new Map();
const count = (map, k)=> map.set(k,(map.get(k)??0)+1);
let browser, page, mock, pass=false, total=0, syntheticAuthReads=0, repairDelivery=null;
try {
  const flags = ['--disable-background-networking','--disable-component-update','--disable-domain-reliability','--disable-sync','--disable-breakpad','--disable-quic','--no-pings','--disable-extensions','--no-first-run','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--proxy-server=http://127.0.0.1:47633','--proxy-bypass-list=<-loopback>;127.0.0.1:47631','--force-webrtc-ip-handling-policy=disable_non_proxied_udp','--enable-unsafe-swiftshader','--disk-cache-size=400000000'];
  const launch = {headless:true,args:flags};
  const cacheShell=join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-mac-arm64/chrome-headless-shell');
  if (existsSync(cacheShell)) launch.executablePath = cacheShell;
  browser=await chromium.launch(launch);
  record('dedicated-browser',{version:browser.version(),origin,device,serviceWorkers:'block',defaultProxy:'unbound loopback 47633',dns:'MAP * ~NOTFOUND',fixture:mode!=='success'?'only repair transport ignores cancel for late delivery':'native fetch'});
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960},locale:'ko-KR',serviceWorkers:'block',hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
  await context.routeWebSocket('**/*', ws=>{
    const u=new URL(ws.url()); count(unknown,'WS '+u.origin); ws.close({code:1000,reason:'Local QA denies all websockets'});
  });
  await context.route('**/*', async route=>{
    const req=route.request(), u=new URL(req.url()); total++;
    if(u.origin !== origin){
      count(unknown,req.method()+' '+u.origin); return route.abort('blockedbyclient');
    }
    if(u.pathname===managed && req.method()==='POST'){
      return mock.handle(route);
    }
    if(u.pathname==='/api/auth/session' && req.method()==='GET'){ syntheticAuthReads++; return route.fulfill({json:{authenticated:true,user:{id:'ai-qa-synthetic',role:'creator',name:'합성 작가',email:null,image:null}}}); }
    if(/^\/(api(?:\/|$)|studio-live|socket\.io)/.test(u.pathname)||!['GET','HEAD'].includes(req.method())){
      count(deniedApi,req.method()+' '+u.pathname);return route.fulfill({status:503,json:{message:'QA loopback only'}});
    }
    return route.continue();
  });
  if(mode!=='success') await context.addInitScript(({origin,path})=>{
    const orig=window.fetch.bind(window);
    let n=0;
    window.__repairTransport={aborts:0,delivered:0,marker:false};
    window.fetch=async(input,init)=>{
      const url=typeof input==='string'?input:input instanceof Request?input.url:input.href;
      const isManaged=new URL(url,location.href).href===origin+path && (init?.method||input?.method||'GET').toUpperCase()==='POST';
      if(isManaged && ++n===2) {
        const incoming=init?.signal || input?.signal;
        if(incoming?.aborted) window.__repairTransport.aborts++;
        else incoming?.addEventListener('abort',()=>window.__repairTransport.aborts++,{once:true});
        const response=await orig(new Request(input,{...init,signal:new AbortController().signal}));
        const text=await response.clone().text();
        window.__repairTransport.delivered++;
        window.__repairTransport.marker=text.includes('QA-A-복구설명');
        return response;
      }
      return orig(input,init);
    };
  },{origin,path:managed});
  page=await context.newPage();
  mock=createRepairMock({mode,page,record:item=>record(item.type,item)});
  const releaseRepair=mock.releaseRepair;
  if(mode!=='success') mock.releaseRepair=async()=>{
    await releaseRepair();
    await page.waitForFunction(()=>window.__repairTransport?.marker,{},{timeout:30000});
    repairDelivery=await page.evaluate(()=>window.__repairTransport);
    assert.equal(repairDelivery.aborts,1); assert.equal(repairDelivery.delivered,1);
    record('repair-delivered-despite-original-abort',repairDelivery);
  };
  page.setDefaultTimeout(65000);
  page.on('pageerror',e=>record('pageerror',{message:String(e).slice(0,500)}));
  page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('Failed to load resource'))count(failures,msg.text().slice(0,230));});
  page.on('requestfailed',req=>{const u=new URL(req.url()); if(u.pathname===managed)record('managed.requestfailed',{error:req.failure()?.errorText}); else if(u.origin===origin&&!u.pathname.startsWith('/api/'))count(failures,(req.failure()?.errorText??'')+' '+u.pathname);});
  page.on('response',res=>{const u=new URL(res.url()); if(u.pathname===managed)record('managed.response',{status:res.status()}); else if(res.status()>=400&&u.origin===origin&&!u.pathname.startsWith('/api/'))count(responses,res.status()+' '+u.pathname);});
  const probe=await page.evaluate(async()=>{
    const out={};
    for(const url of ['https://deny-proof.invalid/check','http://127.0.0.1:47634/check']){
      try{await fetch(url,{mode:'no-cors'});out[url]='unexpected-pass';}catch(e){out[url]=e.name;}
    }
    return out;
  });
  assert.equal(unknown.get('GET https://deny-proof.invalid'),1);
  assert.equal(unknown.get('GET http://127.0.0.1:47634'),1);
  record('guard-probes',{outcome:probe,denied:Object.fromEntries(unknown)});
  await page.goto(origin+'/studio/canvas',{waitUntil:'commit',timeout:60000});
  record('navigation-committed');
  const interval=setInterval(async()=>{const ui=await page.locator('body').innerText({timeout:1500}).catch(()=>''); writeFileSync(join(root,'progress-ui.txt'),ui); console.log('loading',total,page.url(),ui.slice(0,260),JSON.stringify([...failures].slice(-3)),JSON.stringify([...responses].slice(-3)));},10000);
  try{
    await page.waitForFunction(()=>document.body?.innerText?.length>4,{},{timeout:720000});
    record('document-content',{url:page.url()});
    const baseline=await prepareDrawing(page);
    record('saved-synthetic-stroke',baseline);
    assert.ok(baseline?.drawCount>0 && baseline.containsAorB===false);
    if (mode === 'stop') {
      const { runStopOnly } = await import('./stop-only.mjs');
      await runStopOnly({page,mode,mock,dir:root,record,baseline});
    } else {
      await runScenario({page,mode,mock,dir:root,record,baseline});
    }
    record('mock-contracts',await mock.assertComplete());
    pass=true;
  } finally {clearInterval(interval);}
}catch(err){
  record('failure',{error:String(err).slice(0,2000),stack:err.stack?.split('\n').slice(0,6).join('\n')});
  if(page){
    writeFileSync(join(root,'failure-ui.txt'),await page.locator('body').innerText({timeout:3000}).catch(()=>'<unavailable>'));
    await page.screenshot({path:join(root,'failure.png'),timeout:8000}).catch(()=>{});
  }
  process.exitCode=1;
}finally{

  record('summary',{pass,device,mode,managedCalls:mock?.calls.length??0,repairDelivery,total,syntheticAuthReads,blockedOrigins:Object.fromEntries(unknown),blockedApi:Object.fromEntries(deniedApi),failedResources:[...failures].slice(0,70),nonApiHttpErrors:[...responses].slice(0,30)});
  writeFileSync(join(root,'summary.json'),JSON.stringify(events.at(-1).data,null,2));
  await browser?.close();
}
