import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import type { Message, MessageActionRequest } from '@demo/shared';
import { CustomerId, Roles } from '../auth/auth.js';
import { MessagesService } from './messages.service.js';

class MessageActionDto implements MessageActionRequest {
  @IsIn(['ENROLLED', 'DECLINED', 'DISMISSED', 'REMIND_LATER', 'NOT_EV'])
  action: MessageActionRequest['action'];
}

@Roles('CUSTOMER')
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(@CustomerId() id: string): Promise<Message[]> {
    return this.messages.list(id);
  }

  /** Opening a message marks it read. */
  @Get(':id')
  get(@CustomerId() customerId: string, @Param('id') id: string): Promise<Message> {
    return this.messages.open(customerId, id);
  }

  @Post(':id/action')
  act(@CustomerId() customerId: string, @Param('id') id: string, @Body() body: MessageActionDto): Promise<Message> {
    return this.messages.act(customerId, id, body.action);
  }
}
