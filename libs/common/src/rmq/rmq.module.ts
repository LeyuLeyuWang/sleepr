import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RmqService } from './rmq.service';

interface RmqModuleOptions {
  name: string;
}

@Module({
  providers: [RmqService],
  exports: [RmqService],
})
export class RmqModule {
  /**
   * Register a RabbitMQ client that publishes to `name`'s queue. The queue name
   * matches the service constant (e.g. AUTH_SERVICE -> 'auth'), so producers and
   * consumers agree on the queue without any extra config.
   */
  static register({ name }: RmqModuleOptions): DynamicModule {
    return {
      module: RmqModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name,
            useFactory: (configService: ConfigService) => ({
              transport: Transport.RMQ,
              options: {
                urls: [configService.getOrThrow<string>('RABBITMQ_URI')],
                queue: name,
                persistent: true,
                queueOptions: {
                  durable: true,
                  arguments: {
                    'x-dead-letter-exchange': '',
                    'x-dead-letter-routing-key': `${name}.dlq`,
                  },
                },
              },
            }),
            inject: [ConfigService],
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
