const { chromium } = require('playwright');
exports.open = async () => {
  if (!process.env.JANUS_LOGIN || !process.env.JANUS_PASSWORD) throw new Error('Set JANUS_LOGIN and JANUS_PASSWORD to an Owner test account.');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read','clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto((process.env.JANUS_URL || 'http://localhost:3000') + '/login');
  await page.fill('#email', process.env.JANUS_LOGIN);
  await page.fill('input[type=password]', process.env.JANUS_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 });
  return { browser, ctx, page, errors };
};
