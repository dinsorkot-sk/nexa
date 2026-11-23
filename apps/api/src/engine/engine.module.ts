import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EngineController } from './engine.controller';
import { EngineErrorFilter } from './errors.filter';
import { EngineService } from './engine.service';

@Module({
  controllers: [EngineController],
  providers: [EngineService, { provide: APP_FILTER, useClass: EngineErrorFilter }],
  exports: [EngineService],
})
export class EngineModule {}
