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

async function expectTouchable(page, selector) {
  const locator = page.locator(selector);
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const result = await locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      width: r.width,
      height: r.height,
      tag: el.tagName,
      type: el.getAttribute('type') || '',
      hitId: hit?.id || '',
      hitTag: hit?.tagName || '',
      isTarget: hit === el || el.contains(hit)
    };
  });
  expect(result.width).toBeGreaterThan(8);
  if (result.tag === 'BUTTON') expect(result.height).toBeGreaterThanOrEqual(40);
  else expect(result.height).toBeGreaterThan(8);
  expect(result.isTarget, `${selector} is covered by ${result.hitTag}#${result.hitId}`).toBeTruthy();
}

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function emulateInstalled(page) {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => {
      if (query === '(display-mode: standalone)') {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener() {}, removeListener() {},
          addEventListener() {}, removeEventListener() {},
          dispatchEvent() { return true; }
        };
      }
      return nativeMatchMedia(query);
    };
    try {
      Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });
    } catch {}
  });
}

test('browser mode: install gate is visible and its button receives the click', async ({ page }) => {
  await stubMediaPipe(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#firstRunOverlay')).toHaveClass(/show/);
  await expect(page.locator('#settingsView')).toBeHidden();
  await expectTouchable(page, '#setupInstallAction');

  await page.locator('#setupInstallAction').click();
  await expect(page.locator('.setup-message')).toContainText(/navigateur|Installe/i);
  await expect(page.locator('#settingsView')).toBeHidden();
});

test('installed mode: settings controls are not covered and setup can be completed', async ({ page }) => {
  await stubMediaPipe(page);
  await emulateInstalled(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#firstRunOverlay')).toHaveCount(0);
  await expect(page.locator('#settingsView')).toBeVisible();
  await expect(page.locator('#homeView')).toBeHidden();
  await expect(page.locator('#setupGuide')).toBeVisible();

  await expectTouchable(page, '#calibrateBtn');
  await expectTouchable(page, '#alarmVolume');
  await expectTouchable(page, '#closureDelay');
  await expectTouchable(page, '#setupConfirmSettings');

  await setRange(page, '#alarmVolume', 73);
  await setRange(page, '#closureDelay', 1.5);
  await setRange(page, '#yawnThreshold', 0.58);
  await page.locator('#setupConfirmSettings').click();

  const stored = await page.evaluate(() => ({
    volume: localStorage.getItem('cr3atix-vigilance-alarm-volume-v1'),
    detection: JSON.parse(localStorage.getItem('cr3atix-vigilance-detection-settings-v172') || 'null'),
    setup: JSON.parse(localStorage.getItem('cr3atix-vigilance-setup-v196') || 'null')
  }));
  expect(Number(stored.volume)).toBeCloseTo(0.73, 2);
  expect(stored.detection.closureDelay).toBeCloseTo(1.5, 2);
  expect(stored.detection.yawnThreshold).toBeCloseTo(0.58, 2);
  expect(stored.setup.run.detectionConfirmed).toBe(true);
  expect(stored.setup.run.volumeConfirmed).toBe(true);

  await expectTouchable(page, '#backBtn');
  await page.locator('#backBtn').click();
  await expect(page.locator('#settingsView')).toBeVisible();
  await expect(page.locator('#setupGuide')).toContainText(/Termine la configuration initiale/i);

  // Simule uniquement le résultat final d'une calibration réussie pour tester le parcours UI sans caméra physique en CI.
  await page.evaluate(() => {
    localStorage.setItem('cr3atix-vigilance-eye-calibration-v1', JSON.stringify({
      threshold: 0.21,
      baseline: 0.31,
      calibratedAt: new Date().toISOString()
    }));
    const key = 'cr3atix-vigilance-setup-v196';
    const setup = JSON.parse(localStorage.getItem(key));
    setup.run.calibrationConfirmed = true;
    setup.run.detectionConfirmed = true;
    setup.run.volumeConfirmed = true;
    localStorage.setItem(key, JSON.stringify(setup));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.locator('#settingsView')).toBeVisible();
  await expect(page.locator('#setupFinishSettings')).toBeEnabled();
  await expectTouchable(page, '#setupFinishSettings');
  await page.locator('#setupFinishSettings').click();

  await expect(page.locator('#setupGuide')).toHaveCount(0);
  await expect(page.locator('#homeView')).toBeVisible();
  await expect(page.locator('#settingsView')).toBeHidden();

  await expectTouchable(page, '#settingsBtn');
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsView')).toBeVisible();
  await expectTouchable(page, '#backBtn');
  await page.locator('#backBtn').click();
  await expect(page.locator('#homeView')).toBeVisible();
});

test('night theme: onboarding remains readable and buttons stay touchable', async ({ page }) => {
  await stubMediaPipe(page);
  await page.addInitScript(() => localStorage.setItem('cr3atix-vigilance-theme-v1', 'night'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const colors = await page.locator('#firstRunCard').evaluate(el => {
    const s = getComputedStyle(el);
    return { color: s.color, background: s.backgroundColor };
  });
  expect(colors.color).not.toBe(colors.background);
  await expectTouchable(page, '#setupInstallAction');
});
