import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { securityConfig } from './config/security.config';
import { SecurityHeadersMiddleware } from './middleware/security-headers.middleware';
import { errorHandlerMiddleware } from './middleware/error-handler.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.use(new SecurityHeadersMiddleware().use);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || securityConfig.cors.allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: securityConfig.cors.allowedMethods,
    allowedHeaders: securityConfig.cors.allowedHeaders,
    credentials: securityConfig.cors.credentials,
    maxAge: securityConfig.cors.maxAge,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  app.use(errorHandlerMiddleware);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
