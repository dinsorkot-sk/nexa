import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/** Default JSON body limit for every route. */
export const DEFAULT_JSON_LIMIT = '100kb';
/** Import bodies may carry up to 10 MiB of cells plus JSON overhead. */
export const IMPORT_JSON_LIMIT_BYTES = 12 * 1024 * 1024;

const IMPORT_ROUTE = /^\/api\/model\/[a-z][a-z0-9_.]{0,119}\/import$/;

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ error: { type: 'bad_request', message } });
}

/**
 * Parses JSON for the import route only, with a larger cap. It marks the request as parsed so the
 * global body parser (which keeps the small default limit) skips it.
 */
export function importBodyParser(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'POST' || !IMPORT_ROUTE.test(req.path) || !req.is('application/json')) return next();
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > IMPORT_JSON_LIMIT_BYTES) return fail(res, 413, 'Request body is too large');
  const chunks: Buffer[] = [];
  let size = 0;
  let done = false;
  req.on('data', (chunk: Buffer) => {
    if (done) return;
    size += chunk.length;
    if (size > IMPORT_JSON_LIMIT_BYTES) {
      done = true;
      fail(res, 413, 'Request body is too large');
      req.resume();
      return;
    }
    chunks.push(chunk);
  });
  req.on('error', (error) => { if (!done) { done = true; next(error); } });
  req.on('end', () => {
    if (done) return;
    done = true;
    try {
      req.body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      return fail(res, 400, 'Invalid JSON body');
    }
    (req as Request & { _body?: boolean })._body = true;
    next();
  });
}

/** Body parsing setup; create the app with `{ bodyParser: false }` before calling this. */
export function configureBodyParsers(app: NestExpressApplication): void {
  app.use(importBodyParser);
  app.useBodyParser('json', { limit: DEFAULT_JSON_LIMIT });
  app.useBodyParser('urlencoded', { limit: DEFAULT_JSON_LIMIT, extended: true });
}
