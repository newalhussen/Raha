import 'reflect-metadata';
import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

/** Shared by main.ts and the e2e tests so both exercise the same HTTP behaviour. */
export function configureApp(app: INestApplication): void {
  const env = loadEnv();
  app.setGlobalPrefix('api/v1', { exclude: [] });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.enableCors({
    origin: env.corsOrigins,
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-org-id'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true, transformOptions: { enableImplicitConversion: true } }));
}

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  configureApp(app);

  if (!env.isProduction) {
    const doc = new DocumentBuilder()
      .setTitle('Raha API')
      .setDescription('Freight marketplace: shippers, brokers, fleets, drivers, receivers and operations.')
      .setVersion('0.1')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'X-Org-Id', in: 'header' }, 'org')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  }

  app.enableShutdownHooks();
  await app.listen(env.port, '0.0.0.0');
  new Logger('Bootstrap').log(`Raha API on http://localhost:${env.port}/api/v1 (docs: /api/docs)`);
}

if (require.main === module) {
  void bootstrap();
}
