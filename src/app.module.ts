import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BrowserModule } from './browser/browser.module';

import { BullModule } from '@nestjs/bull';
import { CrawlerModuleModule } from './crawler-module/crawler-module.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      useFactory: () => ({
        prefix: 'web-evaluator',
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50
        },
        redis: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379'),
        }
      })
    }),
    CrawlerModuleModule,
    BrowserModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
