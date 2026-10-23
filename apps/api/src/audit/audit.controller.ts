import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { AuditEntry } from '@demo/shared';
import { Roles } from '../auth/auth.js';
import { AuditService, MAX_AUDIT_LIMIT } from './audit.service.js';

class AuditQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_AUDIT_LIMIT) limit?: number;
}

@Roles('STAFF')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Newest first; default 100, max 200. */
  @Get()
  list(@Query() q: AuditQueryDto): Promise<AuditEntry[]> {
    return this.audit.list(q.limit ?? 100);
  }
}
