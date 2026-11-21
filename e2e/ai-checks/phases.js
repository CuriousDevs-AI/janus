const { open } = require('./lib');
const B = (process.env.JANUS_URL || 'http://localhost:3000').replace(/\/$/, '');
const results = [];
const check = (phase, name, ok, detail = '') => { results.push({ phase, name, ok, detail: String(detail).replace(/\s+/g, ' ').slice(0, 220) }); console.log(`${ok === null ? 'BLOCKED' : ok ? 'PASS' : 'FAIL'} [${phase}] ${name} — ${String(detail).replace(/\s+/g, ' ').slice(0, 220)}`); };
const CONV = 'section[aria-label="Conversation with Janus"] ol > li';
async function go(page, path) { await page.goto(B + path, { waitUntil: 'networkidle', timeout: 90000 }); await page.waitForTimeout(800); }
async function ask(page, q) {
  const before = await page.locator(CONV).count();
  const box = page.locator('textarea[aria-label="Ask Janus"]');
  await box.fill(q); await box.press('Enter');
  await page.waitForFunction(([sel, n]) => { const li = document.querySelectorAll(sel); return li.length > n && !li[li.length - 1].querySelector('[role=status]'); }, [CONV, before], { timeout: 60000 });
  return page.locator(CONV).last().innerText();
}
const shellOk = async (page, eyebrow, title) => {
  const e = await page.locator('main header p').first().innerText().catch(() => '');
  const h = await page.locator('main h1').first().innerText().catch(() => '');
  const strip = await page.locator('nav[aria-label="AI pages"]').count();
  return { ok: e.toUpperCase().includes(eyebrow.toUpperCase()) && h.includes(title) && strip === 1, detail: `${e} | ${h} | strip=${strip}` };
};

(async () => {
  require('fs').mkdirSync(process.env.SHOTS || 'e2e/.state/ai-shots', { recursive: true });
  const { browser, ctx, page, errors } = await open();
  const want = (p) => !process.env.ONLY || process.env.ONLY.split(',').some((x) => p.startsWith(x));
  const step = async (phase, name, fn) => { if (!want(phase)) return; try { await fn(); } catch (e) { check(phase, name, false, 'threw: ' + e.message); await page.screenshot({ path: `${process.env.SHOTS || 'e2e/.state/ai-shots'}/fail_${phase}_${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => {}); } };

  // PHASE 0 + 5: keys page
  await step('P0', 'AI keys page and Add a key dialog', async () => {
    await go(page, '/portfolio?view=ai-keys');
    const s = await shellOk(page, 'Portfolio · AI', 'AI Models & Keys');
    check('P0', 'Keys page in the shared AI frame', s.ok, s.detail);
    await page.getByRole('button', { name: 'Add a key' }).first().click();
    await page.waitForTimeout(800);
    const dlg = await page.locator('[role=dialog]').innerText();
    check('P0', 'Add a key dialog opens with provider/model/key', /Gemini|Google/i.test(dlg) && /key/i.test(dlg), dlg.slice(0, 160));
    await page.screenshot({ path: (process.env.SHOTS || 'e2e/.state/ai-shots') + '/p0_add_key.png' });
    await page.keyboard.press('Escape');
  });
  check('P0', 'Save and test a real Gemini key → green success', null, 'No Gemini key in this environment');

  // PHASE 1 rules mode
  await step('P1', 'Portfolio Intelligence rules mode', async () => {
    await go(page, '/portfolio?view=intelligence');
    const s = await shellOk(page, 'Portfolio · AI', 'AI Assistant');
    check('P1', 'Portfolio assistant in shared AI frame', s.ok, s.detail);
    const sel = await page.getByRole('combobox', { name: 'Answer with' }).innerText();
    check('P1', 'Janus rules selected by default', /Janus rules/.test(sel), sel);
    let a = await ask(page, 'Which company needs immediate attention?');
    check('P1', 'Which company needs immediate attention? → figures, no model', /Janus rules · free/.test(a) && /Acme/.test(a) && /₹|\d/.test(a), a);
    a = await ask(page, 'Compare profit across companies');
    const n = (a.match(/Acme (Manufacturing|Retail|Exports|Holdings)/g) || []).length;
    check('P1', 'Compare profit across companies → companies with numbers', n >= 3 && /₹/.test(a), a);
    a = await ask(page, 'How much revenue did each company make this month?');
    check('P1', 'Revenue per company this month', /Acme Retail/.test(a) && /Acme Exports/.test(a) && /₹/.test(a), a);
    a = await ask(page, 'What will our revenue be next quarter?');
    check('P1', 'Forecast refused (rules)', !/will be ₹/i.test(a) && /(forecast|guess|cannot|can't|records|does not)/i.test(a), a);
    a = await ask(page, "Tell me about Apple Inc's stock price");
    check('P1', 'Apple stock → not in records (rules)', /(not|no|cannot|can't)/i.test(a) && !/Apple Inc.*₹/.test(a), a);
    a = await ask(page, 'Delete all my invoices');
    check('P1', 'Delete all invoices → refused/read-only (rules)', /(read|cannot|can't|not|only)/i.test(a), a);
    // copy
    await page.locator(CONV).last().getByRole('button', { name: /Copy answer/ }).click();
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check('P1', 'Copy answer copies text', clip.length > 10, clip.slice(0, 80));
    // focus filter
    await page.getByRole('group', { name: 'Ask about' }).getByRole('button', { name: 'Acme Retail' }).click();
    a = await ask(page, 'How much profit did Acme Retail make?');
    check('P1', 'Company focus scopes answer', /Acme Retail/.test(a) && !/Acme Exports/.test(a), a);
    await page.screenshot({ path: (process.env.SHOTS || 'e2e/.state/ai-shots') + '/p1_rules.png', fullPage: false });
    // New chat
    await page.getByRole('button', { name: 'New chat' }).click();
    await page.waitForTimeout(500);
    check('P1', 'New chat clears the conversation', (await page.locator(CONV).count()) === 0, `turns=${await page.locator(CONV).count()}`);
  });
  check('P1', 'Gemini mode answers (spinner, [F1] sources, cost, grounding)', null, 'No Gemini key');
  check('P1', 'Model persists across refresh/tabs', null, 'Only Janus rules available without a key; persistence code added (localStorage per person)');

  // PHASE 2 knowledge
  await step('P2', 'Knowledge base', async () => {
    await go(page, '/portfolio?view=intelligence');
    await page.getByRole('button', { name: 'See and add knowledge' }).click();
    await page.getByRole('textbox', { name: 'Fact' }).fill('Kavita Stores always pays on the 20th');
    await page.getByRole('button', { name: 'Add fact' }).click();
    await page.waitForTimeout(1500);
    let a = await ask(page, 'When does Kavita Stores pay?');
    check('P2', 'Fact cited in answer', /always pays on the 20th/.test(a) && /told Janus/i.test(a), a);
    await page.getByRole('combobox', { name: 'Kind' }).click();
    await page.getByRole('option', { name: /document/i }).click();
    await page.getByRole('textbox', { name: 'Document title' }).fill('Refund Policy');
    await page.getByRole('textbox', { name: 'Document text' }).fill('Damaged goods are refunded in full within 7 days of delivery when reported with photos. Refunds go back to the original payment method.');
    await page.getByRole('button', { name: 'Add document' }).click();
    await page.waitForTimeout(1500);
    a = await ask(page, 'What is our refund policy for damaged goods?');
    check('P2', 'Document quoted in answer', /7 days/.test(a), a);
    await page.getByRole('button', { name: /Remove fact: Kavita Stores always pays/ }).first().click();
    await page.waitForTimeout(500);
    const confirm = page.locator('[role=alertdialog] button, [role=dialog] button').filter({ hasText: /Remove|Delete|Forget/ });
    if (await confirm.count()) await confirm.first().click();
    await page.waitForTimeout(1500);
    await go(page, '/portfolio?view=intelligence');
    await page.getByRole('button', { name: 'New chat' }).click().catch(() => {});
    a = await ask(page, 'When does Kavita Stores pay?');
    check('P2', 'Deleted fact no longer cited', !/always pays on the 20th/.test(a), a);
  });
  check('P2', 'REMEMBER suggestion from a model answer', null, 'Needs a model (Gemini key)');

  // PHASE 3 departments
  const depts = [
    ['crm-sales', 'CRM & Sales', ['Who should I call today?', 'What is our win rate?']],
    ['hr-people', 'HR & People', ['Who is on leave today?', 'How many people do we have?']],
    ['finance-accounting', 'Finance', ['How much profit did we make?', 'How much cash is in the bank?']],
    ['operations-inventory', 'Operations', ['What stock is below reorder level?']],
    ['customer-support', 'Customer Support', ['How many tickets are open?']],
    ['projects-delivery', 'Projects', ['Which projects are late?']],
    ['team-chat', 'Team Chat', ['What needs my attention?']],
  ];
  for (const [ws, label, qs] of depts) await step('P3', ws, async () => {
    await go(page, `/ai?workspace=${ws}`);
    const s = await shellOk(page, label, 'AI Assistant');
    check('P3', `${ws}: shared AI frame`, s.ok, s.detail);
    for (const q of qs) { const a = await ask(page, q); check('P3', `${ws}: ${q}`, /Janus rules · free/.test(a) && a.split('\n').length > 2, a); }
    await page.screenshot({ path: `${process.env.SHOTS || 'e2e/.state/ai-shots'}/p3_${ws}.png` });
  });
  await step('P3', 'period switch', async () => {
    await go(page, '/ai?workspace=finance-accounting');
    const m = await ask(page, 'How much profit did we make?');
    await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: 'This quarter' }).click();
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'New chat' }).click();
    const q = await ask(page, 'How much profit did we make?');
    check('P3', 'Period month → quarter changes answer', m.replace(/How much profit did we make\?/, '') !== q.replace(/How much profit did we make\?/, ''), `month: ${m.slice(30, 120)} | quarter: ${q.slice(30, 120)}`);
  });

  // PHASE 4 business
  await step('P4', 'Business AI', async () => {
    await go(page, '/ai?workspace=business');
    const s = await shellOk(page, 'Business Management · AI', 'AI Assistant');
    check('P4', 'Business assistant in shared AI frame', s.ok, s.detail);
    for (const q of ['What needs my attention?', 'How much profit did we make?', 'Who is my biggest customer?']) {
      const a = await ask(page, q);
      check('P4', `Business: ${q} (current company only)`, !/Acme (Retail|Exports|Holdings)/.test(a), a);
    }
    await go(page, '/ai?workspace=business&view=advisor');
    await page.waitForTimeout(3000);
    const adv = await page.locator('main').first().innerText();
    check('P4', 'Advisor area cards', /How each area stands|Sales|Money/i.test(adv), adv.slice(0, 200));
    const add = page.getByRole('button', { name: 'Add to my plan' });
    if (await add.count()) { await add.first().click(); await page.waitForTimeout(1500); const after = await page.locator('main').first().innerText(); check('P4', 'Add to my plan works', /plan/i.test(after), 'clicked'); }
    else check('P4', 'Add to my plan works', null, 'No findings offered for this company');
    await page.screenshot({ path: (process.env.SHOTS || 'e2e/.state/ai-shots') + '/p4_advisor.png' });
    await go(page, '/ai?workspace=business&view=todo'); await page.waitForTimeout(2000);
    check('P4', 'What needs you tab', (await page.locator('main').first().innerText()).length > 200, (await page.locator('main').first().innerText()).slice(300, 500));
    await go(page, '/ai?workspace=business&view=knowledge'); await page.waitForTimeout(1500);
    const kn = await page.locator('main').first().innerText();
    check('P4', 'What Janus knows tab: facts/docs', /Refund Policy/.test(kn), kn.slice(300, 500));
  });

  // PHASE 6/7/8 shared pages per workspace
  for (const ws of ['portfolio', 'business', 'crm-sales', 'hr-people']) {
    for (const [path, title] of [['agents', 'AI Agents'], ['automations', 'Workflows'], ['evaluations', 'AI Dashboard'], ['usage', 'AI Usage & Cost']]) {
      await step('P6-8', `${path} ${ws}`, async () => {
        await go(page, `/${path}?workspace=${ws}`);
        const s = await shellOk(page, '· AI', title);
        const t = await page.locator('main').first().innerText();
        let extra = true;
        if (path === 'evaluations') extra = ['Trust score', 'Accuracy', 'Hallucination rate', 'Avg latency'].every((w) => t.toUpperCase().includes(w.toUpperCase()));
        if (path === 'automations') extra = /template|Start with one/i.test(t);
        check('P6-8', `/${path}?workspace=${ws} scoped + shared frame`, s.ok && extra, s.detail);
        if (ws === 'crm-sales') await page.screenshot({ path: `${process.env.SHOTS || 'e2e/.state/ai-shots'}/p68_${path}_${ws}.png` });
      });
    }
  }
  await step('P7', 'workflow link keeps workspace', async () => {
    await go(page, '/agents?workspace=hr-people');
    const href = await page.getByRole('link', { name: /Open Workflows/ }).getAttribute('href');
    check('P7', 'Agents → Workflows stays in workspace', href.includes('hr-people'), href);
  });

  // PHASE 9 settings
  for (const tab of ['ai', 'knowledge', 'automation']) await step('P9', tab, async () => {
    await go(page, `/settings?tab=${tab}`);
    const t = await page.locator('main').first().innerText();
    check('P9', `/settings?tab=${tab} loads relevant content`, t.length > 150 && !/error|could not/i.test(t.slice(0, 400)), t.slice(0, 220));
    await page.screenshot({ path: `${process.env.SHOTS || 'e2e/.state/ai-shots'}/p9_${tab}.png` });
  });

  // PHASE 10
  await step('P10', 'invalid key', async () => {
    await go(page, '/portfolio?view=ai-keys');
    await page.getByRole('button', { name: 'Add a key' }).first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: (process.env.SHOTS || 'e2e/.state/ai-shots') + '/p10_dialog.png' });
    await page.locator('[role=dialog]').getByRole('button', { name: /Google Gemini/ }).click();
    await page.waitForTimeout(1500);
    const key = page.getByLabel('API key');
    if (await key.count()) {
      await key.fill('invalid-key-12345');
      await page.locator('[role=dialog]').getByRole('button', { name: /Save and test|Save/ }).first().click();
      await page.waitForTimeout(8000);
      const t = await page.locator('body').innerText();
      check('P10', 'Invalid key → API key rejected', /rejected|not valid|invalid/i.test(t), (t.match(/.{0,80}(rejected|not valid|invalid).{0,80}/i) || [''])[0]);
      await page.screenshot({ path: (process.env.SHOTS || 'e2e/.state/ai-shots') + '/p10_invalid_key.png' });
      await page.keyboard.press('Escape');
    } else check('P10', 'Invalid key → API key rejected', false, 'no API key field');
  });
  await step('P10', 'rapid questions', async () => {
    await go(page, '/ai?workspace=crm-sales');
    for (let i = 0; i < 22; i++) await ask(page, i % 2 ? 'What is our win rate?' : 'Who should I call today?');
    check('P10', '22 rapid rules questions, no crash', errors.filter((e) => e.startsWith('pageerror')).length === 0, `${await page.locator(CONV).count()} turns`);
    const scroll = await page.evaluate(() => { const el = document.querySelector('section[aria-label="Conversation with Janus"] .overflow-y-auto'); return el.scrollHeight > el.clientHeight; });
    check('P10', 'Long conversation scrolls inside the chat', scroll, '');
  });
  check('P10', 'Model rate-limit message (daily question cap, 429)', null, 'Needs a model; backend returns question_limit 429 shown as the error in the turn');
  await step('P10', 'two tabs separate', async () => {
    await go(page, '/portfolio?view=intelligence');
    await page.getByRole('button', { name: 'New chat' }).click().catch(() => {});
    await ask(page, 'Compare profit across companies');
    const p2 = await ctx.newPage();
    await p2.goto(B + '/ai?workspace=crm-sales', { waitUntil: 'networkidle' });
    await p2.waitForTimeout(800);
    const crm = await p2.locator(CONV).allInnerTexts();
    check('P10', 'Intelligence and CRM keep separate conversations', !crm.some((t) => /Compare profit/.test(t)), `crm turns=${crm.length}`);
    await p2.close();
  });
  await step('P10', 'empty company', async () => {
    await go(page, '/portfolio?view=intelligence');
    await page.getByRole('group', { name: 'Ask about' }).getByRole('button', { name: 'Acme Holdings' }).click();
    const a = await ask(page, 'Who is the biggest customer of Acme Holdings?');
    check('P10', 'Company with no sales → says records do not have it', /(no |not |none|nothing)/i.test(a), a);
  });
  if (!process.env.SKIP_BACKEND_DOWN) await step('P10', 'backend down', async () => {
    await go(page, '/ai?workspace=crm-sales');
    const pid = require('child_process').execSync("pgrep -f '.venv/bin/uvicorn janus_api'").toString().trim().split('\n')[0]; process.kill(Number(pid), 'SIGSTOP');
    try {
      await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: 'This financial year' }).click();
      await page.waitForTimeout(12000);
      const t = await page.locator('main').first().innerText();
      check('P10', 'Backend stopped → graceful, page stays usable', errors.filter((e) => e.startsWith('pageerror')).length === 0 && t.length > 100, t.slice(0, 200));
      await page.screenshot({ path: (process.env.SHOTS || 'e2e/.state/ai-shots') + '/p10_backend_down.png' });
    } finally { process.kill(Number(pid), 'SIGCONT'); }
  });

  // PHASE 11 history in page
  await step('P11', 'history across navigation', async () => {
    await go(page, '/ai?workspace=hr-people');
    await page.getByRole('button', { name: 'New chat' }).click().catch(() => {});
    await ask(page, 'Who is on leave today?'); await ask(page, 'How many people do we have?'); await ask(page, 'Any expense claims waiting?');
    await page.getByRole('link', { name: 'AI Agents' }).first().click(); await page.waitForTimeout(1500);
    await page.goBack(); await page.waitForTimeout(1500);
    check('P11', 'Conversation still there after navigating away and back', (await page.locator(CONV).count()) === 3, `${await page.locator(CONV).count()} turns`);
  });
  check('P11', '"Forget earlier questions" clears saved model answers with a toast', null, 'Saved history only holds model answers; needs a key');

  // PHASE 12 preview
  await step('P12', 'preview', async () => {
    await go(page, '/portfolio?view=overview&preview=group_analyst');
    await go(page, '/portfolio?view=intelligence');
    const dis = await page.getByRole('combobox', { name: 'Answer with' }).isDisabled();
    check('P12', 'Preview: model selector disabled', dis, `disabled=${dis}`);
    const a = await ask(page, 'Compare profit across companies');
    check('P12', 'Preview (group analyst): money hidden', !/₹\s?[\d,]+.*profit/i.test(a) || /not shared|hidden|no money/i.test(a), a);
    await go(page, '/portfolio?view=ai-keys');
    const t = await page.locator('main').first().innerText();
    check('P12', 'Preview: AI keys "Add a key" hidden, Only an Owner message', !(await page.getByRole('button', { name: 'Add a key' }).count()) && /Only an Owner/.test(t), t.match(/Only an Owner[^.]*\./)?.[0] ?? '');
    await page.screenshot({ path: (process.env.SHOTS || 'e2e/.state/ai-shots') + '/p12_keys_preview.png' });
    await page.getByRole('button', { name: 'Exit preview' }).click();
  });

  // With a Gemini key saved and shared (Phase 0 done by hand), GEMINI=1 runs the model checks.
  if (process.env.GEMINI) await step('GEM', 'gemini', async () => {
    await go(page, '/portfolio?view=intelligence');
    await page.getByRole('combobox', { name: 'Answer with' }).click();
    await page.getByRole('option', { name: /gemini/i }).first().click();
    let a = await ask(page, 'Which company has the most revenue and why?');
    check('GEM', 'Gemini answer with sources and cost', /Sources \(\d+\)/.test(a) && /\$/.test(a), a);
    a = await ask(page, 'What are the biggest financial risks across my portfolio?');
    check('GEM', 'Risks cite more than one company', (a.match(/Acme \w+/g) || []).length >= 2, a);
    a = await ask(page, 'What will our revenue be next quarter?');
    check('GEM', 'Refuses to forecast', /(forecast|predict|cannot|can't|do not|don't)/i.test(a), a);
    a = await ask(page, "Tell me about Apple Inc's stock price");
    check('GEM', 'Apple: not in records', /(not in|no record|does not have|don't have|cannot)/i.test(a), a);
    a = await ask(page, 'Delete all my invoices');
    check('GEM', 'Delete: refuses, read-only', /(read|cannot|can't|only)/i.test(a), a);
    a = await ask(page, 'Our office closes at 6pm on Fridays');
    check('GEM', 'REMEMBER suggestion appears', /suggests remembering/i.test(a), a);
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
    const sel = await page.getByRole('combobox', { name: 'Answer with' }).innerText();
    check('GEM', 'Model stays selected after refresh', /gemini/i.test(sel), sel);
    check('GEM', 'History loads after refresh', (await page.locator(CONV).count()) > 0, `${await page.locator(CONV).count()} turns`);
    await page.getByRole('button', { name: 'Forget earlier questions' }).click();
    await page.waitForTimeout(1500);
    check('GEM', 'Forget clears history with a toast', /no longer remembers/i.test(await page.locator('body').innerText()), '');
  });

  console.log('\nconsole/page errors:', [...new Set(errors)].slice(0, 15).join('\n'));
  require('fs').writeFileSync((process.env.SHOTS || 'e2e/.state/ai-shots') + '/results.json', JSON.stringify(results, null, 1));
  const c = (v) => results.filter((r) => r.ok === v).length;
  console.log(`\nSUMMARY pass=${c(true)} fail=${c(false)} blocked=${c(null)}`);
  await browser.close();
})();
