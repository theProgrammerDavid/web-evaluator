import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as path from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(helmet({ contentSecurityPolicy: false }));

  const config = new DocumentBuilder()
    .setTitle('Web Evaluator')
    .setDescription('Crawls URLs, takes screenshots, and checks spelling via AI')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  app.useStaticAssets(path.resolve('public'));
  app.useStaticAssets(path.resolve('screenshots'), { prefix: '/screenshots' });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
