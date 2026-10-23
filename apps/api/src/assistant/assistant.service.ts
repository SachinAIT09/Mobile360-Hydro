import { Injectable, NotImplementedException } from '@nestjs/common';
import type { AssistantAnswer, AssistantContext, AssistantSuggestions } from '@demo/shared';

/** Scripted, stateless assistant: intent matching over live demo data. Filled in by the assistant workstream. */
@Injectable()
export class AssistantService {
  askStaff(question: string, context: AssistantContext): Promise<AssistantAnswer> {
    void question;
    void context;
    return Promise.reject(new NotImplementedException('Staff assistant is not implemented yet'));
  }

  staffSuggestions(): Promise<AssistantSuggestions> {
    return Promise.reject(new NotImplementedException('Staff assistant is not implemented yet'));
  }

  askMe(customerId: string, question: string, context: AssistantContext): Promise<AssistantAnswer> {
    void customerId;
    void question;
    void context;
    return Promise.reject(new NotImplementedException('Customer assistant is not implemented yet'));
  }

  mySuggestions(customerId: string): Promise<AssistantSuggestions> {
    void customerId;
    return Promise.reject(new NotImplementedException('Customer assistant is not implemented yet'));
  }
}
