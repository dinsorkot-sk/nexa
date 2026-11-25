import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EngineController } from './engine.controller';
import { DataTransferController } from './data-transfer.controller';
import { EngineErrorFilter } from './errors.filter';
import { EngineService } from './engine.service';
import { AuthService } from './auth.service';
import { PortalController } from './portal.controller';
import { ReportPdfService } from './report-pdf.service';

@Module({
  controllers: [EngineController, DataTransferController, PortalController],
  providers: [EngineService, AuthService, ReportPdfService, { provide: APP_FILTER, useClass: EngineErrorFilter }],
  exports: [EngineService],
})
export class EngineModule {}
