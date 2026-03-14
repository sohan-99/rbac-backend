import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit-log')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  listAuditLogs(@Query('limit') limit?: string) {
    const parsedLimit = Number(limit ?? 100);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(500, parsedLimit))
      : 100;

    return this.auditService.listRecent(safeLimit);
  }
}
