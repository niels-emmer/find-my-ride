import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const screenshotDir = path.join(repoRoot, 'docs', 'assets', 'screenshots');

const frontendUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:15173';
const accessToken = process.env.ACCESS_TOKEN;
if (!accessToken) {
  throw new Error('ACCESS_TOKEN is required. Run refresh.sh or set ACCESS_TOKEN before capture.');
}

const chromeCandidates = [
  process.env.CHROME_EXECUTABLE,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
const chromeExecutable = chromeCandidates.find((candidate) => fs.existsSync(candidate));

const reverseGeocodeStub = 'Market Street 88, 94103 San Francisco, California, United States';
const screenshotPaths = {
  home: path.join(screenshotDir, 'home.png'),
  history: path.join(screenshotDir, 'history.png'),
  settings: path.join(screenshotDir, 'settings.png')
};

const browser = await chromium.launch({
  headless: true,
  ...(chromeExecutable ? { executablePath: chromeExecutable } : {})
});

try {
  const context = await browser.newContext({
    viewport: { width: 1170, height: 1992 },
    deviceScaleFactor: 1,
    geolocation: { latitude: 37.7749, longitude: -122.4194 },
    permissions: ['geolocation']
  });

  await context.route('**://nominatim.openstreetmap.org/reverse*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        display_name: reverseGeocodeStub,
        address: {
          road: 'Market Street',
          house_number: '88',
          postcode: '94103',
          city: 'San Francisco',
          state: 'California',
          country: 'United States'
        }
      })
    });
  });

  await context.addInitScript((token) => {
    localStorage.setItem('fmr_access_token', token);
    localStorage.setItem('fmr_theme_mode', 'dark');
    localStorage.setItem('fmr_accent_color', 'evergreen');
  }, accessToken);

  const page = await context.newPage();
  await page.goto(frontendUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1:has-text("Parked?")', { timeout: 30000 });

  // README capture requirement: 2.5x visual zoom at native PNG dimensions.
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2.5';
  });

  // home.png
  await page.getByRole('button', { name: 'Locate' }).click();
  await page.getByText(reverseGeocodeStub).waitFor({ timeout: 30000 });
  await page.getByLabel('Note (optional)').fill('2nd level, section 3d near stairs');
  await page.waitForTimeout(500);
  await page.screenshot({ path: screenshotPaths.home });

  // history.png
  await page.getByRole('button', { name: 'history' }).click();
  await page.getByRole('heading', { name: 'History' }).waitFor({ timeout: 30000 });
  const moreInfoButtons = page.getByRole('button', { name: 'More info' });
  await moreInfoButtons.nth(1).waitFor({ timeout: 30000 });
  await moreInfoButtons.nth(1).click();
  await page.locator('iframe[title="OpenStreetMap preview of parked location"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: screenshotPaths.history });

  // settings.png
  await page.getByRole('button', { name: 'settings' }).click();
  await page.getByRole('heading', { name: 'Profile' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: screenshotPaths.settings });
} finally {
  await browser.close();
}
