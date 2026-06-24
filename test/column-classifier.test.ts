import { describe, it, expect } from 'vitest';
import { classifyColumn } from '../src/extract/column-classifier.ts';

describe('classifyColumn (閉じた ColumnFlag enum)', () => {
  it('OAuth トークン列', () => {
    expect(classifyColumn('access_token')).toBe('oauth-token');
    expect(classifyColumn('refresh_token')).toBe('oauth-token');
    expect(classifyColumn('google_access_token')).toBe('oauth-token');
    // token_type / scope はトークンではない
    expect(classifyColumn('token_type')).toBe('plain');
    expect(classifyColumn('scope')).toBe('plain');
  });

  it('資格情報列', () => {
    expect(classifyColumn('password_hash')).toBe('password');
    expect(classifyColumn('client_secret_hash')).toBe('password');
    expect(classifyColumn('totp_secret')).toBe('password');
  });

  it('PII 列', () => {
    expect(classifyColumn('email')).toBe('personal-pii');
    expect(classifyColumn('phone_number')).toBe('personal-pii');
  });

  it('allowlist: owner-ref / display-cache', () => {
    expect(classifyColumn('owner_user_id')).toBe('owner-ref');
    expect(classifyColumn('user_id')).toBe('owner-ref');
    expect(classifyColumn('display_name')).toBe('display-cache');
    expect(classifyColumn('name')).toBe('display-cache');
  });

  it('その他は plain', () => {
    expect(classifyColumn('facility_id')).toBe('plain');
    expect(classifyColumn('start_at')).toBe('plain');
  });
});
