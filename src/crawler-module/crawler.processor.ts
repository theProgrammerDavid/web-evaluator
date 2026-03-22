import { Process, Processor } from '@nestjs/bull';
import { type Job } from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import { AiService } from 'src/ai/ai.service';
import { BrowserService } from 'src/browser/browser.service';
import { CRAWL_VIEWPORTS, WEBSITE_CRAWL_CONCURRENCY, WEBSITE_CRAWL_JOB, WEBSITE_CRAWL_QUEUE } from 'src/constants';
import { type CrawlRequestDto } from 'src/crawler/dto/crawl-request.dto';
import { PngDiffService } from 'src/png-diff/png-diff.service';
import { performance } from 'perf_hooks';

async function prepareForScreenshot(page: import('puppeteer').Page, waitMs: number): Promise<void> {
    // Slow scroll to bottom to trigger scroll-based animations
    await page.evaluate(async () => {
        await new Promise<void>(resolve => {
            const distance = 100;
            const delay = 80;
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                if (window.scrollY + window.innerHeight >= document.body.scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, delay);
        });
    });
    // Scroll back to top so sticky headers are in their natural position
    await page.evaluate(() => window.scrollTo(0, 0));
    // Wait for any animations triggered by the scroll to settle
    await new Promise(resolve => setTimeout(resolve, waitMs));
}

@Processor(WEBSITE_CRAWL_QUEUE)
export class CrawlerProcessor {

    constructor(
        private browserService: BrowserService,
        private aiService: AiService,
        private pngDiffService: PngDiffService,
    ) {}

    @Process({ name: WEBSITE_CRAWL_JOB, concurrency: WEBSITE_CRAWL_CONCURRENCY })
    async handleCrawl(job: Job<CrawlRequestDto>) {
        const { url, waitMs, language, useHeatmap } = job.data;

        const safeHostname = new URL(url).hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const timestamp = Date.now();

        // Directory structure: screenshots/originals/, screenshots/new/, screenshots/heatmaps/
        const originalsDir = path.resolve('screenshots', 'originals');
        const newDir = path.resolve('screenshots', 'new');
        const heatmapsDir = path.resolve('screenshots', 'heatmaps');
        [originalsDir, newDir, heatmapsDir].forEach(d => fs.mkdirSync(d, { recursive: true }));

        const [textResult, ...screenshotResults] = await Promise.all([
            // Extract text using a dedicated page
            this.browserService.newPage().then(async page => {
                const t0 = performance.now();
                await page.goto(url, { waitUntil: 'networkidle2' });
                const text = await page.evaluate(() => document.body.innerText);
                await page.close();
                console.log(`text extracting for ${url} took ${performance.now() - t0}ms`);
                return text;
            }),
            // Screenshot each viewport in parallel, each with its own page
            ...CRAWL_VIEWPORTS.map(async viewport => {
                const t0 = performance.now();
                const page = await this.browserService.newPage();
                await page.setViewport({ width: viewport.width, height: viewport.height, isMobile: viewport.isMobile });
                await page.goto(url, { waitUntil: 'networkidle2' });
                await prepareForScreenshot(page, waitMs);

                const newScreenshotPath = path.join(newDir, `${safeHostname}_${viewport.name}_${timestamp}.png`);
                await page.screenshot({ path: newScreenshotPath, fullPage: true });
                await page.close();
                console.log(`screenshot for ${viewport.name} took ${performance.now() - t0}ms`);
                return { screenshotPath: newScreenshotPath, viewportName: viewport.name };
            }),
        ]);

        const text = textResult as string;
        const screenshots = screenshotResults as { screenshotPath: string; viewportName: string }[];

        // Run diffs against originals if useHeatmap is requested
        const diffResults = await Promise.all(
            screenshots.map(async ({ screenshotPath, viewportName }) => {
                const originalPath = path.join(originalsDir, `${safeHostname}_${viewportName}_latest.png`);
                const heatmapPath = path.join(heatmapsDir, `${safeHostname}_${viewportName}_${timestamp}.png`);

                const hasOriginal = useHeatmap && this.pngDiffService.isReady() && fs.existsSync(originalPath);
                if (!hasOriginal) return { viewportName, heatmapPath: null, diff: null };

                try {
                    const diff = await this.pngDiffService.diff(originalPath, screenshotPath, heatmapPath);
                    return { viewportName, heatmapPath, diff };
                } catch (err) {
                    console.warn(`png_diff failed for ${viewportName}: ${err.message}`);
                    return { viewportName, heatmapPath: null, diff: null };
                }
            })
        );

        // Promote new screenshots to originals (latest baseline)
        screenshots.forEach(({ screenshotPath, viewportName }) => {
            const latestPath = path.join(originalsDir, `${safeHostname}_${viewportName}_latest.png`);
            fs.copyFileSync(screenshotPath, latestPath);
        });

        const diffMap = Object.fromEntries(diffResults.map(d => [d.viewportName, d]));

        const [spellCheckResults, ...responsivenessRatings] = await Promise.all([
            this.aiService.checkSpelling(text, language),
            ...screenshots.map(({ screenshotPath, viewportName }) => {
                const heatmapPath = diffMap[viewportName]?.heatmapPath ?? undefined;
                return this.aiService.rateResponsiveness(screenshotPath, viewportName, heatmapPath);
            }),
        ]);

        const ratingsDir = path.resolve('screenshot_ratings');
        fs.mkdirSync(ratingsDir, { recursive: true });
        fs.writeFileSync(
            path.join(ratingsDir, `${safeHostname}_${timestamp}.json`),
            JSON.stringify(responsivenessRatings, null, 2),
        );

        const screenshotUrls = screenshots.map(({ screenshotPath, viewportName }) => {
            const d = diffMap[viewportName];
            return {
                viewport: viewportName,
                url: `/screenshots/new/${path.basename(screenshotPath)}`,
                heatmapUrl: d?.heatmapPath ? `/screenshots/heatmaps/${path.basename(d.heatmapPath)}` : null,
                diff: d?.diff ?? null,
            };
        });

        return { spellCheckResults, responsivenessRatings, screenshotUrls };
    }
}
