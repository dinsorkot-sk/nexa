import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateSessionToken } from '../src/index';

describe('@nexa/auth password and session utilities', () => {
  it('hashes and verifies password correctly', async () => {
    const password = 'SuperSecretPassword123!';
    const hash = await hashPassword(password);
    expect(hash).toContain(':');

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('WrongPassword', hash);
    expect(isInvalid).toBe(false);
  });

  it('generates secure session tokens', () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();
    expect(token1).toHaveLength(64);
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
  });
});
