import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const pass = readFileSync('dados/acesso-producao.txt', 'utf8').trim().split('\n').pop();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:3741/login', { waitUntil: 'networkidle0' });
await page.type('input[name=password]', 'bussola');
await Promise.all([page.click('button'), page.waitForNavigation({ waitUntil: 'networkidle0' })]);
for (const file of [`${process.env.SCR}/fatura-teste.pdf`, `${process.env.SCR}/extrato-teste.pdf`, 'dados/teste-cartao.ofx']) {
  await page.goto('http://localhost:3741/importar', { waitUntil: 'networkidle0' });
  await (await page.$('input[type=file]')).uploadFile(file);
  const btn = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Pré-visualizar')));
  await btn.asElement().click();
  await new Promise((r) => setTimeout(r, 6000));
  const t = await page.evaluate(() => {
    const m = document.querySelector('main').innerText;
    const i = m.indexOf('Pré-visualizar');
    return m.slice(i + 14, i + 420).replace(/\n{2,}/g, '\n').trim();
  });
  console.log('\n=====', file.split('/').pop(), '\n' + t);
}
await browser.close();
