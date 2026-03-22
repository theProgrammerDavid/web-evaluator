import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { type Browser } from 'puppeteer';

puppeteer.use(StealthPlugin());

@Injectable()
export class BrowserService {
    private browser: Browser;

    async init(): Promise<void> {
        this.browser = await puppeteer.launch({
            headless: process.env.HEADLESS_MODE === 'true',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
            ],
        }) as unknown as Browser;
    }

    constructor() {
        this.init();
    }

    public async newPage() {
        return this.browser.newPage();
    }
}
