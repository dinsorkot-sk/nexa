import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EngineController } from './engine.controller';
import { DataTransferController } from './data-transfer.controller';
import { EngineErrorFilter } from './errors.filter';
import { EngineService } from './engine.service';
import { AuthService } from './auth.service';
import { PortalController } from './portal.controller';
import { BusController } from './bus.controller';
import { ReportPdfService } from './report-pdf.service';
import { SmtpMailService } from './smtp-mail.service';

@Module({
  controllers: [EngineController, DataTransferController, PortalController, BusController],
  providers: [EngineService, AuthService, ReportPdfService, SmtpMailService, { provide: APP_FILTER, useClass: EngineErrorFilter }],
  exports: [EngineService],
})
export class EngineModule {}
