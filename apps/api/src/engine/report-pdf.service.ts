import { Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser } from 'playwright';

const MAX_HTML_BYTES = 1_000_000;
const MAX_PDF_BYTES = 10_000_000;
const RENDER_TIMEOUT_MS = 15_000;
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'none'",
  "font-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

@Injectable()
export class ReportPdfService implements OnModuleDestroy {
  private busy = false;
  private activeBrowser?: Browser;

  async render(html: string): Promise<Uint8Array> {
    if (this.busy) throw new ServiceUnavailableException('PDF renderer is busy');
    if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
      throw new ServiceUnavailableException('PDF input is too large');
    }

    this.busy = true;
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({
        headless: true,
        chromiumSandbox: true,
        timeout: RENDER_TIMEOUT_MS,
      });
      this.activeBrowser = browser;
      const context = await this.withTimeout(browser.newContext({
        javaScriptEnabled: false,
        serviceWorkers: 'block',
        acceptDownloads: false,
      }), 'PDF renderer setup timed out');
      await this.withTimeout(context.route('**/*', (route) => route.abort('blockedbyclient')), 'PDF renderer setup timed out');
      const page = await this.withTimeout(context.newPage(), 'PDF renderer setup timed out');
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      await this.withTimeout(page.setContent(
        '<!doctype html><html><head><meta charset="utf-8">' +
          '<meta http-equiv="Content-Security-Policy" content="' + CONTENT_SECURITY_POLICY + '">' +
          '<style>@page{size:A4;margin:16mm}html{font-family:Arial,sans-serif}body{overflow-wrap:anywhere}</style>' +
          '</head><body>' + html + '</body></html>',
        { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS },
      ), 'PDF content rendering timed out');
      const pdf = await this.withTimeout(page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        tagged: true,
      }), 'PDF generation timed out');
      if (pdf.byteLength > MAX_PDF_BYTES) throw new ServiceUnavailableException('Generated PDF is too large');
      return new Uint8Array(pdf);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('PDF renderer is unavailable');
    } finally {
      this.activeBrowser = undefined;
      if (browser) await browser.close().catch(() => undefined);
      this.busy = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.activeBrowser?.close().catch(() => undefined);
  }

  private async withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new ServiceUnavailableException(message)), RENDER_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
