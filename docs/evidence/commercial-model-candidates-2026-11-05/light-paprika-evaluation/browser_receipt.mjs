import { chromium } from '/workspace/toonstudio/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--disable-gpu','--no-sandbox']});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8921/test.html');await page.waitForFunction(()=>typeof window.runCandidate==='function');
 const result=await page.evaluate(()=>window.runCandidate());
 if(result.receipts.some(x=>x.nonfinite!==0||x.maxAbsoluteErrorVsCpu>2/255))throw new Error(JSON.stringify(result));
 await writeFile('/tmp/toonstudio-light-paprika-evaluation/browser-wasm-result.json',JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify(result)+'\n');
}finally{await browser.close();}
