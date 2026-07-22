import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { RmqService } from '@app/common';
import * as cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule);
  const configService = app.get(ConfigService);
  const rmqService = app.get<RmqService>(RmqService);
  // authenticate is a high-frequency request/response RPC that can legitimately
  // fail (invalid token) inside a guard before the handler runs, so it uses
  // broker auto-ack. Manual ack + DLQ is reserved for the booking pipeline
  // (create_charge, notify_email) where message durability actually matters.
  app.connectMicroservice(rmqService.getOptions('auth', true));
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useLogger(app.get(Logger));
  await app.startAllMicroservices();
  await app.listen(configService.get('HTTP_PORT'));
}
bootstrap();
