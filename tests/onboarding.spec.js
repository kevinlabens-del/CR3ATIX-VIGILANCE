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
    return {width:r.width,height:r.height,tag:el.tagName,hitId:hit?.id||'',hitTag:hit?.tagName||'',isTarget:hit===el||el.contains(hit)};
  });
  expect(result.width).toBeGreaterThan(8);
  if(result.tag === 'BUTTON') expect(result.height).toBeGreaterThanOrEqual(40);
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

async function emulateStandalone(page) {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => {
      if(query === '(display-mode: standalone)') return {matches:true,media:query,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}};
      return nativeMatchMedia(query);
    };
    try{Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>true})}catch{}
  });
}

async function emulateRelatedPwaInstalled(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator,'getInstalledRelatedApps',{configurable:true,value:async()=>[{platform:'webapp',id:'https://kevinlabens-del.github.io/CR3ATIX-VIGILANCE/',url:'http://127.0.0.1:4173/manifest.webmanifest'}]});
  });
}

async function simulateSuccessfulCalibration(page) {
  await page.evaluate(() => {
    localStorage.setItem('cr3atix-vigilance-eye-calibration-v1', JSON.stringify({threshold:0.21,baseline:0.31,calibratedAt:new Date().toISOString()}));
  });
  await expect(page.locator('#wizardCalibrationNext')).toBeEnabled();
}

test('browser mode: installation is the only first step and the button responds', async ({ page }) => {
  await stubMediaPipe(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#setupWizard')).toBeVisible();
  await expect(page.locator('#setupWizardTitle')).toHaveText(/Installe VIGILANCE/i);
  await expect(page.locator('#settingsView')).toBeHidden();
  await expectTouchable(page, '#wizardInstallBtn');
  await page.locator('#wizardInstallBtn').click();
  await expect(page.locator('#wizardMessage')).toContainText(/menu|Installe/i);
});

test('browser mode: an installed PWA advances directly to camera calibration', async ({ page }) => {
  await stubMediaPipe(page);
  await emulateRelatedPwaInstalled(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#setupWizardTitle')).toHaveText(/Calibre tes yeux/i);
  await expect(page.locator('#settingsView')).toBeHidden();
  await expect(page.locator('#setupWizardSlot #calibrateBtn')).toBeVisible();
  const flag=await page.evaluate(()=>localStorage.getItem('cr3atix-vigilance-install-confirmed-v1'));
  expect(flag).toContain('getInstalledRelatedApps');
});

test('appinstalled event advances automatically without a verify step', async ({ page }) => {
  await stubMediaPipe(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#setupWizardTitle')).toHaveText(/Installe VIGILANCE/i);
  await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('#setupWizardTitle')).toHaveText(/Calibre tes yeux/i);
  await expect(page.locator('#wizardInstallBtn')).toHaveCount(0);
});

test('standalone mode: complete five-step setup without browsing the settings page', async ({ page }) => {
  await stubMediaPipe(page);
  await emulateStandalone(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#setupWizardTitle')).toHaveText(/Calibre tes yeux/i);
  await expect(page.locator('#settingsView')).toBeHidden();
  await expectTouchable(page, '#calibrateBtn');
  await expect(page.locator('#wizardCalibrationNext')).toBeDisabled();
  await simulateSuccessfulCalibration(page);
  await expectTouchable(page, '#wizardCalibrationNext');
  await page.locator('#wizardCalibrationNext').click();

  await expect(page.locator('#setupWizardTitle')).toHaveText(/Règle la détection/i);
  await expect(page.locator('#setupWizardSlot #closureDelay')).toBeVisible();
  await expectTouchable(page, '#closureDelay');
  await expectTouchable(page, '#yawnThreshold');
  await setRange(page, '#closureDelay', 1.5);
  await setRange(page, '#yawnThreshold', 0.58);
  await expectTouchable(page, '#wizardDetectionNext');
  await page.locator('#wizardDetectionNext').click();

  await expect(page.locator('#setupWizardTitle')).toHaveText(/Choisis ton alarme/i);
  await expect(page.locator('#setupWizardSlot #alarmVolume')).toBeVisible();
  await expectTouchable(page, '#alarmVolume');
  await setRange(page, '#alarmVolume', 73);
  await page.locator('input[name="alarmMode"][value="siren"]').check();
  await expectTouchable(page, '#wizardTestVolume');
  await expectTouchable(page, '#wizardAlarmNext');
  await page.locator('#wizardAlarmNext').click();

  await expect(page.locator('#setupWizardTitle')).toHaveText(/VIGILANCE est prête/i);
  await expect(page.locator('.wizard-summary')).toContainText('73 %');
  await expect(page.locator('.wizard-summary')).toContainText('Sirène');
  await expectTouchable(page, '#wizardFinish');
  await page.locator('#wizardFinish').click();

  await expect(page.locator('#setupWizard')).toHaveCount(0);
  await expect(page.locator('#homeView')).toBeVisible();
  await expect(page.locator('#settingsView')).toBeHidden();
  const stored=await page.evaluate(()=>({
    setup:JSON.parse(localStorage.getItem('cr3atix-vigilance-setup-v200')||'null'),
    volume:localStorage.getItem('cr3atix-vigilance-alarm-volume-v1'),
    detection:JSON.parse(localStorage.getItem('cr3atix-vigilance-detection-settings-v172')||'null')
  }));
  expect(stored.setup.completed).toBe(true);
  expect(Number(stored.volume)).toBeCloseTo(.73,2);
  expect(stored.detection.closureDelay).toBeCloseTo(1.5,2);
  expect(stored.detection.yawnThreshold).toBeCloseTo(.58,2);

  await expectTouchable(page, '#settingsBtn');
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsView')).toBeVisible();
  await expect(page.locator('#calibrateBtn')).toBeVisible();
  await expect(page.locator('#closureDelay')).toBeVisible();
  await expect(page.locator('#alarmVolume')).toBeVisible();
  await expectTouchable(page, '#restartSetupBtn');
});

test('voice mode cannot be validated without a recorded message', async ({ page }) => {
  await stubMediaPipe(page);
  await emulateStandalone(page);
  await page.goto('/', { waitUntil:'domcontentloaded' });
  await simulateSuccessfulCalibration(page);
  await page.locator('#wizardCalibrationNext').click();
  await page.locator('#wizardDetectionNext').click();
  await page.locator('input[name="alarmMode"][value="voice"]').check();
  await page.locator('#wizardAlarmNext').click();
  await expect(page.locator('#setupWizardTitle')).toHaveText(/Choisis ton alarme/i);
  await expect(page.locator('#wizardMessage')).toContainText(/enregistre/i);
});

test('night theme: wizard stays readable and touchable', async ({ page }) => {
  await stubMediaPipe(page);
  await page.addInitScript(()=>localStorage.setItem('cr3atix-vigilance-theme-v1','night'));
  await page.goto('/', { waitUntil:'domcontentloaded' });
  const colors=await page.locator('.setup-wizard-card').evaluate(el=>{const s=getComputedStyle(el);return{color:s.color,background:s.backgroundColor}});
  expect(colors.color).not.toBe(colors.background);
  await expectTouchable(page, '#wizardInstallBtn');
});
