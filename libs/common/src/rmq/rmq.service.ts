import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RmqContext, RmqOptions, Transport } from '@nestjs/microservices';

@Injectable()
export class RmqService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Build the server-side (consumer) options for a queue.
   *
   * noAck is disabled so every message must be manually acknowledged, and the
   * queue is declared durable with a dead-letter route to `<queue>.dlq`, so a
   * message that fails processing is nack'd off the main queue and parked on
   * its dead-letter queue for retry/inspection instead of being silently lost.
   */
  getOptions(queue: string, noAck = false): RmqOptions {
    return {
      transport: Transport.RMQ,
      options: {
        urls: [this.configService.getOrThrow<string>('RABBITMQ_URI')],
        queue,
        noAck,
        persistent: true,
        prefetchCount: 1,
        queueOptions: {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': `${queue}.dlq`,
          },
        },
      },
    };
  }

  /** Acknowledge a successfully-processed message. */
  ack(context: RmqContext): void {
    const channel = context.getChannelRef();
    const originalMessage = context.getMessage();
    channel.ack(originalMessage);
  }

  /**
   * Negatively acknowledge a message. With requeue=false (the default) the
   * broker dead-letters it to `<queue>.dlq`; with requeue=true it is redelivered
   * for another attempt.
   */
  nack(context: RmqContext, requeue = false): void {
    const channel = context.getChannelRef();
    const originalMessage = context.getMessage();
    channel.nack(originalMessage, false, requeue);
  }
}
