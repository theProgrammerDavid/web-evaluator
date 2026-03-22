import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { AiModule } from 'src/ai/ai.module';
import { BrowserModule } from 'src/browser/browser.module';
import { WEBSITE_CRAWL_QUEUE } from 'src/constants';
import { CrawlerController } from 'src/crawler/crawler.controller';
import { PngDiffModule } from 'src/png-diff/png-diff.module';
import { CrawlerProcessor } from './crawler.processor';

@Module({
    imports: [
        AiModule,
        BrowserModule,
        PngDiffModule,
        BullModule.registerQueueAsync(
            {
                name: WEBSITE_CRAWL_QUEUE
            }
        )
    ],
    controllers: [CrawlerController],
    providers: [CrawlerProcessor]
})
export class CrawlerModuleModule {}
