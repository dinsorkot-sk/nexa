import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthService } from './auth.service';
import { EngineService } from './engine.service';

function hiddenInput(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Run the provisioning command in an interactive terminal'));
  }
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    const previousRawMode = input.isRaw;
    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    let value = '';
    let unsupportedInput = false;
    const finish = (error?: Error) => {
      input.off('data', onData);
      input.setRawMode(previousRawMode ?? false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else if (unsupportedInput) reject(new Error('The provisioning terminal accepts printable ASCII passwords only'));
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 3) {
          finish(new Error('Cancelled'));
          return;
        }
        if (byte === 13 || byte === 10) {
          finish();
          return;
        }
        if (byte === 8 || byte === 127) {
          value = value.slice(0, -1);
          continue;
        }
        if (byte >= 32 && byte <= 126) value += String.fromCharCode(byte);
        else unsupportedInput = true;
      }
    };
    input.on('data', onData);
  });
}

async function main(): Promise<void> {
  const [tenant, login] = process.argv.slice(2);
  if (!tenant || !login || process.argv.length !== 4) {
    throw new Error('Usage: pnpm --filter @nexa/api auth:provision -- <tenant> <login>');
  }
  const application = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const engine = application.get(EngineService);
    const auth = application.get(AuthService);
    if (!engine.config.tenants.has(tenant)) throw new Error('Tenant is not configured in NEXA_TENANTS');
    const password = await hiddenInput('New password (12–1024 characters): ');
    const confirmation = await hiddenInput('Confirm password: ');
    if (password !== confirmation) throw new Error('Passwords do not match');
    try {
      await auth.provisionPassword(tenant, login, password);
    } catch {
      throw new Error('Password provisioning failed; check tenant database health and user status');
    }
    process.stdout.write('Password stored. Existing sessions and API keys were revoked.\n');
  } finally {
    await application.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write((error instanceof Error ? error.message : 'Provisioning failed') + '\n');
  process.exitCode = 1;
});
