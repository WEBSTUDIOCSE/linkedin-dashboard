/**
 * Render carousel HTML slides as PNG images using Puppeteer.
 * Usage: node render-slides.js <htmlPath> <outputDir>
 * Output: <outputDir>/slide-1.png, slide-2.png, etc.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function render() {
  const htmlPath = process.argv[2];
  const outputDir = process.argv[3] || './slides';

  if (!htmlPath || !fs.existsSync(htmlPath)) {
    console.error('Usage: node render-slides.js <htmlPath> [outputDir]');
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080 });

  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  // Find all slide elements
  const slideCount = await page.evaluate(() => {
    const slides = document.querySelectorAll('[data-slide], .slide');
    return slides.length || document.querySelectorAll('div[style*="1080px"]').length || 1;
  });

  console.log(`Found ${slideCount} slides`);

  // Capture each slide
  for (let i = 0; i < slideCount; i++) {
    const slideSelector = `[data-slide="${i + 1}"], .slide:nth-child(${i + 1})`;
    const hasSlide = await page.$(slideSelector);

    if (hasSlide) {
      await page.screenshot({
        path: path.join(outputDir, `slide-${i + 1}.png`),
        clip: { x: 0, y: i * 1080, width: 1080, height: 1080 },
      });
    } else {
      // Fallback: capture by Y offset
      await page.screenshot({
        path: path.join(outputDir, `slide-${i + 1}.png`),
        clip: { x: 0, y: i * 1080, width: 1080, height: 1080 },
      });
    }
    console.log(`Rendered slide ${i + 1}`);
  }

  await browser.close();
  console.log(`Done. ${slideCount} slides saved to ${outputDir}`);
}

render().catch(err => {
  console.error('Render failed:', err);
  process.exit(1);
});
