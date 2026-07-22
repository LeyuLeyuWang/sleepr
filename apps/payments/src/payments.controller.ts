import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { Ctx, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { RmqService } from '@app/common';
import { PaymentsService } from './payments.service';
import { PaymentsCreateChargeDto } from './dto/payments-create-charge.dto';

@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly rmqService: RmqService,
  ) {}

  @MessagePattern('create_charge')
  @UsePipes(new ValidationPipe())
  async createCharge(
    @Payload() data: PaymentsCreateChargeDto,
    @Ctx() context: RmqContext,
  ) {
    try {
      const result = await this.paymentsService.createCharge(data);
      this.rmqService.ack(context);
      return result;
    } catch (err) {
      // Charge failed: dead-letter the message instead of losing it, and
      // propagate the error so the booking request fails fast.
      this.rmqService.nack(context);
      throw err;
    }
  }
}
