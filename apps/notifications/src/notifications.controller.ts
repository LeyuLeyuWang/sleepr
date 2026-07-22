import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { RmqService } from '@app/common';
import { NotifyEmailDto } from './dto/notify-email.dto';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly rmqService: RmqService,
  ) {}

  @UsePipes(new ValidationPipe())
  @EventPattern('notify_email')
  async notifyEmail(@Payload() data: NotifyEmailDto, @Ctx() context: RmqContext) {
    try {
      await this.notificationsService.notifyEmail(data);
      this.rmqService.ack(context);
    } catch (err) {
      // Email delivery failed: dead-letter for retry/inspection rather than
      // acknowledging (and dropping) an unsent notification.
      this.rmqService.nack(context);
    }
  }
}
