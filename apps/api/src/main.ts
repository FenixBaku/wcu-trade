import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/exceptions';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  // Bearer-token auth (no cookies), so reflecting origins is safe. CORS_ORIGINS=* allows any
  // origin (split hosting); for single-service hosting the web is same-origin and needs no CORS.
  const origins = config.get<string[]>('corsOrigins') ?? [];
  app.enableCors({ origin: origins.includes('*') ? true : origins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  // Single-service hosting: if the built web app is present, serve it from the API so one
  // deploy (Railway/Render/etc.) serves both the SPA (at /) and the API (at /api). The SPA
  // then talks to the API same-origin — no CORS, no separate static site.
  const webDist = join(__dirname, '../../web/dist');
  if (existsSync(webDist)) {
    app.useStaticAssets(webDist);
    const server = app.getHttpAdapter().getInstance();
    // SPA fallback for any non-API, non-socket route.
    server.get(/^(?!\/api|\/socket\.io).*/, (_req: any, res: any) =>
      res.sendFile(join(webDist, 'index.html')),
    );
    logger.log(`Serving web app from ${webDist}`);
  }

  const port = config.get<number>('apiPort')!;
  await app.listen(port, '0.0.0.0');
  logger.log(`WCU TRADE listening on http://localhost:${port} (API at /api)`);
}
bootstrap();
