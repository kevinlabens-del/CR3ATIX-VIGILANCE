const { test, expect } = require('@playwright/test');

async function stubMediaPipe(page) {
  await page.route('https://cdn.jsdelivr.net/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        export const FilesetResolver = { forVisionTasks: async () => ({}) };
        export class FaceLandmarker {
          static async createFromOptions(){ return { detectForVideo(){ return { faceLandmarks: [] }; } }; }
        }
      `
    });
  });
}

test.beforeEach(async ({ page }) => {
  await stubMediaPipe(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__vigilanceStability))).toBe(true);
});

test('a normal short blink does not change the main vigilance state', async ({ page }) => {
  const snapshots = await page.evaluate(() => {
    const s = window.__vigilanceStability;
    s.startTest(0);
    return [
      s.feedRaw('ATTENTION', 'fermeture détectée', 100),
      s.feedRaw('VIGILANT', 'analyse en temps réel', 250),
      s.feedRaw('VIGILANT', 'analyse en temps réel', 1000)
    ];
  });
  expect(snapshots[0].label).toBe('VIGILANT');
  expect(snapshots[1].label).toBe('VIGILANT');
  expect(snapshots[2].label).toBe('VIGILANT');
});

test('attention and danger require a sustained closure and stable recovery', async ({ page }) => {
  const snapshots = await page.evaluate(() => {
    const s = window.__vigilanceStability;
    s.startTest(0);
    return [
      s.feedRaw('ATTENTION', '', 1000),
      s.feedRaw('ATTENTION', '', 1500),
      s.feedRaw('DANGER', '', 2100),
      s.feedRaw('DANGER', '', 2250),
      s.feedRaw('VIGILANT', '', 2300),
      s.feedRaw('VIGILANT', '', 4400)
    ];
  });
  expect(snapshots.map(s => s.label)).toEqual([
    'VIGILANT',
    'ATTENTION',
    'ATTENTION',
    'DANGER',
    'DANGER',
    'VIGILANT'
  ]);
});

test('PERCLOS fatigue waits for warmup and uses enter/exit hysteresis', async ({ page }) => {
  const result = await page.evaluate(() => {
    const s = window.__vigilanceStability;
    s.startTest(0);
    document.querySelector('#perclos').textContent = '40';
    const before = s.feedRaw('VIGILANT', '', 30000);
    const entered = s.feedRaw('VIGILANT', '', 36000);
    document.querySelector('#perclos').textContent = '20';
    const stillFatigued = s.feedRaw('VIGILANT', '', 37000);
    const recovered = s.feedRaw('VIGILANT', '', 46000);
    return { before, entered, stillFatigued, recovered };
  });
  expect(result.before.label).toBe('VIGILANT');
  expect(result.entered.label).toBe('FATIGUE ÉLEVÉE');
  expect(result.stillFatigued.label).toBe('FATIGUE ÉLEVÉE');
  expect(result.recovered.label).toBe('VIGILANT');
});

test('losing the face pauses analysis instead of declaring fatigue', async ({ page }) => {
  const snapshots = await page.evaluate(() => {
    const s = window.__vigilanceStability;
    s.startTest(0);
    return [
      s.feedRaw('VISAGE ABSENT', 'replace le visage', 5000),
      s.feedRaw('VIGILANT', '', 5100),
      s.feedRaw('VIGILANT', '', 6000)
    ];
  });
  expect(snapshots[0].label).toBe('ANALYSE EN PAUSE');
  expect(snapshots[0].type).toBe('idle');
  expect(snapshots[1].label).toBe('ANALYSE');
  expect(snapshots[2].label).toBe('VIGILANT');
});
