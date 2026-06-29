import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: '/', method: RequestMethod.GET }],
  });
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Aljeel AP Portal API')
    .setDescription('Supplier Accounts Payable portal REST API')
    .setVersion(process.env.API_VERSION ?? '0.0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3002);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  console.log(`Health: http://localhost:${port}/api/v1/health`);
}

void bootstrap();
