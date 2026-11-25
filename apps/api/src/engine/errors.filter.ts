import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { AccessError, ConcurrencyError, EngineError, MissingRecordError, UserError, ValidationError } from '@nexa/engine';
import type { ErrorResponse } from '@nexa/shared';
import type { Response } from 'express';
import { ZodError } from 'zod';

type ErrorType = ErrorResponse['error']['type'];

/** Maps engine and validation errors to HTTP statuses with a stable `{ error: { type, message } }` body. */
@Catch()
export class EngineErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Api');

  catch(err: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const [status, type, message] = this.map(err);
    if (status >= 500) this.logger.error(err instanceof Error ? err.stack ?? err.message : String(err));
    const body: ErrorResponse = { error: { type, message } };
    res.status(status).json(body);
  }

  private map(err: unknown): [number, ErrorType, string] {
    if (err instanceof ZodError) {
      return [HttpStatus.BAD_REQUEST, 'bad_request', err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')];
    }
    // body-parser failures (raised before routing)
    const parserType = (err as { type?: unknown } | null)?.type;
    if (parserType === 'entity.too.large') return [HttpStatus.PAYLOAD_TOO_LARGE, 'bad_request', 'Request body is too large'];
    if (parserType === 'entity.parse.failed') return [HttpStatus.BAD_REQUEST, 'bad_request', 'Invalid JSON body'];
    if (err instanceof AccessError) return [HttpStatus.FORBIDDEN, 'access', err.message];
    if (err instanceof MissingRecordError) return [HttpStatus.NOT_FOUND, 'missing', err.message];
    if (err instanceof ConcurrencyError) return [HttpStatus.CONFLICT, 'conflict', err.message];
    if (err instanceof ValidationError) return [HttpStatus.UNPROCESSABLE_ENTITY, 'validation', err.message];
    if (err instanceof UserError) return [HttpStatus.UNPROCESSABLE_ENTITY, 'user', err.message];
    if (err instanceof EngineError) return [HttpStatus.BAD_REQUEST, 'bad_request', err.message];
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const type: ErrorType = status === 401 ? 'unauthorized' : status === 403 ? 'access' : status < 500 ? 'bad_request' : 'internal';
      return [status, type, err.message];
    }
    // never leak internals (SQL, stack traces) to clients
    return [HttpStatus.INTERNAL_SERVER_ERROR, 'internal', 'Internal server error'];
  }
}
