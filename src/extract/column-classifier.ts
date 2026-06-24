// DB カラム名 → ColumnFlag の分類。 ColumnFlag は閉じた enum なので switch 風の
// 優先順位付き判定で実装する (OCP closed-enum: プラグイン機構/registry は作らない)。
//
// 判定順は「機微度の高いものを先に」。 トークン > 資格情報 > PII > 所有参照 >
// 表示キャッシュ > plain。 allowlist (owner_user_id + *display*name) は
// owner-ref / display-cache フラグとして表現し、 PII 違反スキャンから除外される。

import type { ColumnFlag } from '../model/contract-graph.ts';

/** snake_case のカラム名を 1 つの主フラグへ分類する。 */
export function classifyColumn(rawName: string): ColumnFlag {
  const name = rawName.toLowerCase();

  // 1. OAuth トークン。 access/refresh/oauth/bearer/id トークンに限定する。
  //    bare 'token' / 'token_hash' (例: 単発の return_token, セッション token) は
  //    OAuth とは限らないため除外する (誤検出回避)。 token_type / scope も除外。
  if (/(?:^|_)(?:access|refresh|oauth|bearer|id)_token$/.test(name)) {
    return 'oauth-token';
  }

  // 2. 資格情報 (password / *_secret / secret_hash / totp_secret 等)。
  if (
    /password/.test(name) ||
    /(?:^|_)secret(?:_hash)?$/.test(name) ||
    /_secret$/.test(name) ||
    /(?:^|_)private_key/.test(name)
  ) {
    return 'password';
  }

  // 3. 個人識別情報 (email / phone / 住所 / 生年月日 等)。
  if (
    /(?:^|_)email$/.test(name) ||
    /(?:^|_)phone(?:_number)?$/.test(name) ||
    /(?:^|_)address$/.test(name) ||
    /(?:^|_)(?:dob|birth(?:day|date)?)$/.test(name) ||
    /(?:^|_)ssn$/.test(name) ||
    /(?:^|_)real_name$/.test(name)
  ) {
    return 'personal-pii';
  }

  // 4. 所有参照 (Cernere sub / owner)。 allowlist。
  if (
    /(?:^|_)owner_user_id$/.test(name) ||
    name === 'user_id' ||
    /(?:^|_)owner_id$/.test(name) ||
    /(?:^|_)created_by$/.test(name)
  ) {
    return 'owner-ref';
  }

  // 5. 表示用キャッシュ (display name 系)。 allowlist。
  if (
    /display_name/.test(name) ||
    name === 'name' ||
    name === 'nickname' ||
    name === 'label' ||
    /(?:^|_)avatar(?:_url)?$/.test(name)
  ) {
    return 'display-cache';
  }

  return 'plain';
}
