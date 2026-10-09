import { describe, expect, it } from 'vitest';
import { failingGuardFields } from './guards';

describe('workflow guards', () => {
  it('passes when every check holds', () => {
    expect(failingGuardFields({ status: { eq: 'ready' }, owner: { notEmpty: true } }, { status: 'ready', owner: 'u1' })).toEqual([]);
  });

  it('reports each failing field id', () => {
    expect(failingGuardFields({ status: { eq: 'ready' }, owner: { notEmpty: true } }, { status: 'draft' })).toEqual(['status', 'owner']);
  });

  it('treats neq as a forbidden value', () => {
    expect(failingGuardFields({ priority: { neq: 'low' } }, { priority: 'low' })).toEqual(['priority']);
    expect(failingGuardFields({ priority: { neq: 'low' } }, { priority: 'high' })).toEqual([]);
  });

  it('treats null, undefined, and empty strings as empty', () => {
    expect(failingGuardFields({ note: { notEmpty: true } }, { note: '' })).toEqual(['note']);
    expect(failingGuardFields({ note: { notEmpty: true } }, { note: null })).toEqual(['note']);
    expect(failingGuardFields({ note: { notEmpty: true } }, {})).toEqual(['note']);
  });
});
