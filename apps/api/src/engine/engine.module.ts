import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EngineController } from './engine.controller';
import { EngineErrorFilter } from './errors.filter';
import { EngineService } from './engine.service';
import { AuthService } from './auth.service';

@Module({
  controllers: [EngineController],
  providers: [EngineService, AuthService, { provide: APP_FILTER, useClass: EngineErrorFilter }],
  exports: [EngineService],
})
export class EngineModule {}
