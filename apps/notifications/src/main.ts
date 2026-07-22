import { NestFactory } from '@nestjs/core';
import { RmqService } from '@app/common';
import { Logger } from 'nestjs-pino';
import { NotificationsModule } from './notifications.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationsModule);
  const rmqService = app.get<RmqService>(RmqService);
  app.connectMicroservice(rmqService.getOptions('notifications'));
  app.useLogger(app.get(Logger));
  await app.startAllMicroservices();
}
bootstrap();
