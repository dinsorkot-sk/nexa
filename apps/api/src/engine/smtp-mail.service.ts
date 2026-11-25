import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { z } from 'zod';
import type { MailTransport } from '@nexa/engine';

const smtpSettings = z.object({
  NEXA_SMTP_TENANT: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/),
  NEXA_SMTP_HOST: z.string().max(253).regex(/^[a-z0-9][a-z0-9.-]*$/i),
  NEXA_SMTP_PORT: z.string().regex(/^[0-9]{1,5}$/).transform(Number).pipe(z.number().min(1).max(65_535)).default(587),
  NEXA_SMTP_FROM: z.email(),
  NEXA_SMTP_USER: z.string().min(1).optional(),
  NEXA_SMTP_PASSWORD: z.string().min(1).optional(),
}).refine((settings) => Boolean(settings.NEXA_SMTP_USER) === Boolean(settings.NEXA_SMTP_PASSWORD));

@Injectable()
export class SmtpMailService {
  transportFor(tenant: string): MailTransport {
    const settings = smtpSettings.safeParse(process.env);
    if (!settings.success || settings.data.NEXA_SMTP_TENANT !== tenant) {
      throw new ServiceUnavailableException('SMTP is unavailable for this tenant');
    }
    const config = settings.data;
    const from = config.NEXA_SMTP_FROM;
    const secure = config.NEXA_SMTP_PORT === 465;
    const transport = createTransport({
      host: config.NEXA_SMTP_HOST,
      port: config.NEXA_SMTP_PORT,
      secure,
      requireTLS: !secure,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      disableFileAccess: true,
      disableUrlAccess: true,
      ...(config.NEXA_SMTP_USER && config.NEXA_SMTP_PASSWORD
        ? { auth: { user: config.NEXA_SMTP_USER, pass: config.NEXA_SMTP_PASSWORD } }
        : {}),
    });
    return {
      async deliver({ messageId, recipients, subject, bodyHtml }) {
        const options = {
          from, to: recipients, subject, html: bodyHtml, messageId,
          signal: AbortSignal.timeout(25_000),
        };
        const result = await transport.sendMail(options);
        if (result.accepted.length !== recipients.length || result.rejected.length) {
          throw new Error('SMTP recipient was rejected');
        }
      },
    };
  }
}
