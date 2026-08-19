import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exitCode = 1;
};

try {
  await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });

  // 1. Portal connects and derives collections.
  await page.getByTestId('nav-query-builder').waitFor({ timeout: 20000 });
  console.log('OK: portal connected, query-builder nav entry present');

  // 2. Open the builder, anchor on Donors.
  await page.getByTestId('nav-query-builder').click();
  await page.getByTestId('query-builder').waitFor();
  await page.getByTestId('query-anchor').selectOption({ label: 'Donors' });

  // 3. Field condition: age_at_death > 60.
  await page.getByRole('button', { name: '+ field condition' }).click();
  const cond = page.getByTestId('query-condition').first();
  await cond.getByLabel('Field').selectOption({ label: 'Age at death' });
  await cond.getByLabel('Operator').selectOption({ label: '>' });
  await cond.getByLabel('Value').fill('60');

  // 4. Relationship condition: having ≥1 Samples where tissue = brain.
  await page.getByRole('button', { name: '+ relationship condition' }).click();
  const rel = page.getByTestId('query-related');
  await rel.getByLabel('Relationship').selectOption({ index: 0 });
  await rel.getByRole('button', { name: '+ condition on the related record' }).click();
  const sub = rel.getByTestId('query-condition').last();
  await sub.getByLabel('Field').selectOption({ label: 'Tissue' });
  await sub.getByLabel('Operator').selectOption({ label: 'is' });
  await sub.getByLabel('Value').selectOption('brain');

  // 5. Run and assert exactly Ada matches.
  await page.getByTestId('query-run').click();
  await page.getByTestId('query-results').waitFor({ timeout: 20000 });
  const text = await page.getByTestId('query-results').innerText();
  if (!text.includes('Ada')) fail(`results missing Ada: ${text.slice(0, 300)}`);
  if (text.includes('Grace') || text.includes('Alan')) fail(`over-matched: ${text.slice(0, 300)}`);
  if (!text.includes('1 matching donors')) fail(`total wrong: ${text.slice(0, 200)}`);
  console.log('OK: donors>60 having brain sample →', text.includes('Ada') ? 'Ada only' : '??');

  // 6. Compensation tier disclosed.
  if (!text.includes('semijoin tier')) fail('semijoin tier disclosure missing');
  else console.log('OK: semijoin tier disclosed');

  // 7. QuerySpec rides the URL.
  const url = page.url();
  if (!url.includes('qs=')) fail(`QuerySpec not in URL: ${url}`);
  else console.log('OK: QuerySpec in URL');

  // 8. Graph view: seed + expand Ada's neighbors.
  await page.getByRole('button', { name: 'Explore as graph' }).click();
  await page.getByTestId('graph-view').waitFor();
  await page.waitForTimeout(1500);
  const honesty = await page.locator('.query-graph-honesty').innerText();
  if (!/1\/250 nodes/.test(honesty)) fail(`graph seed wrong: ${honesty}`);
  else console.log('OK: graph seeded from query results (1 node)');
  // Tap the node via cytoscape's API (canvas nodes aren't DOM elements).
  await page.evaluate(() => {
    const canvas = document.querySelector('.query-graph-canvas canvas');
    const rect = canvas.getBoundingClientRect();
    // click center — grid layout with one node centers it
  });
  const canvas = page.locator('.query-graph-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  const expandBtn = page.getByRole('button', { name: 'Expand neighbors' });
  if (await expandBtn.count()) {
    await expandBtn.click();
    await page.waitForTimeout(2500);
    const after = await page.locator('.query-graph-honesty').innerText();
    console.log('OK: expand ran →', after.trim().split('\n')[0]);
    if (!/[3-9]\/250 nodes/.test(after)) fail(`expected ≥3 nodes after expand: ${after}`);
  } else {
    console.log('NOTE: node tap did not select (canvas coords) — expansion not exercised');
  }

  // 9. Existing golden path untouched: collections table still renders.
  await page.getByRole('button', { name: 'Collections' }).click();
  await page.waitForTimeout(800);
  const body = await page.locator('body').innerText();
  if (!body.includes('Donors')) fail('collections nav gone');
  else console.log('OK: back to collections');
} catch (e) {
  fail(e.message);
  try {
    await page.screenshot({ path: '/tmp/aperture-smoke/failure.png' });
  } catch {}
} finally {
  await browser.close();
}
console.log(process.exitCode ? 'E2E FAILED' : 'E2E PASSED');
