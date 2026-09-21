import puppeteer from 'puppeteer-core';
import { sealData } from 'iron-session';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const seal = await sealData({ loggedIn: true }, { password: env.SESSION_SECRET, ttl: 60 * 60 * 24 * 30 });
const out = process.argv[2];
const base = 'http://localhost:3741';
const pages = ['/', '/lancar', '/faturas', '/transacoes'];

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setCookie({ name: 'bussola_session', value: seal, domain: 'localhost', path: '/' });

for (const [label, vp, scheme] of [['mobile-light', { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }, 'light'], ['desktop-dark', { width: 1280, height: 900 }, 'dark'], ]) {
  await page.setViewport(vp);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  for (const p of pages) {
    const name = p === '/' ? 'painel' : p.replace(/^\//, '').replace(/\?.*$/, '');
    await page.goto(base + p, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: `${out}/${label}__${name}.png`, fullPage: true });
    console.log('ok', label, name);
  }
}
await browser.close();
