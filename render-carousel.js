const puppeteer = require('puppeteer');
const path = require('path');

async function renderCarousel() {
  const htmlPath = path.resolve(__dirname, 'carousel.html');
  const pdfPath = path.resolve(__dirname, 'carousel.pdf');

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Load the HTML file
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  // Each slide is 1080x1080 — get the number of slides
  const slideCount = await page.evaluate(() =>
    document.querySelectorAll('.slide').length
  );

  console.log(`Found ${slideCount} slides`);

  await page.pdf({
    path: pdfPath,
    width: '1080px',
    height: '1080px',
    printBackground: true,
    pageRanges: '',
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  await browser.close();
  console.log(`PDF saved to: ${pdfPath}`);
}

renderCarousel().catch(err => {
  console.error(err);
  process.exit(1);
});
