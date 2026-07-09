// ルールカタログ — 設計書 §2.3。
//
// ルールは閉じた集合なので **静的配列 + switch** で列挙する。 プラグイン機構は
// 作らない (OCP closed-enum: 新ルールはこの配列とソースを直接編集して追加する)。

import type { ContractGraph, Violation } from '../model/contract-graph.ts';
import {
  cData01,
  cData02,
  cData03,
  cData04,
  cData05,
  cData06,
  cData07,
  cData08,
} from './data-rules.ts';
import {
  hLink01,
  hLink02,
  hLink03,
  hLink04,
  hLink05,
  hLink06,
  hLink07,
  hLink08,
} from './linkage-rules.ts';

export type RuleId =
  | 'C-DATA-01'
  | 'C-DATA-02'
  | 'C-DATA-03'
  | 'C-DATA-04'
  | 'C-DATA-05'
  | 'C-DATA-06'
  | 'C-DATA-07'
  | 'C-DATA-08'
  | 'H-LINK-01'
  | 'H-LINK-02'
  | 'H-LINK-03'
  | 'H-LINK-04'
  | 'H-LINK-05'
  | 'H-LINK-06'
  | 'H-LINK-07'
  | 'H-LINK-08';

export const RULE_IDS: readonly RuleId[] = [
  'C-DATA-01',
  'C-DATA-02',
  'C-DATA-03',
  'C-DATA-04',
  'C-DATA-05',
  'C-DATA-06',
  'C-DATA-07',
  'C-DATA-08',
  'H-LINK-01',
  'H-LINK-02',
  'H-LINK-03',
  'H-LINK-04',
  'H-LINK-05',
  'H-LINK-06',
  'H-LINK-07',
  'H-LINK-08',
];

/** 単一ルールを評価する (閉じた enum の switch)。 */
export function evaluateRule(id: RuleId, g: ContractGraph): Violation[] {
  switch (id) {
    case 'C-DATA-01':
      return cData01(g);
    case 'C-DATA-02':
      return cData02(g);
    case 'C-DATA-03':
      return cData03(g);
    case 'C-DATA-04':
      return cData04(g);
    case 'C-DATA-05':
      return cData05(g);
    case 'C-DATA-06':
      return cData06(g);
    case 'C-DATA-07':
      return cData07(g);
    case 'C-DATA-08':
      return cData08(g);
    case 'H-LINK-01':
      return hLink01(g);
    case 'H-LINK-02':
      return hLink02(g);
    case 'H-LINK-03':
      return hLink03(g);
    case 'H-LINK-04':
      return hLink04(g);
    case 'H-LINK-05':
      return hLink05(g);
    case 'H-LINK-06':
      return hLink06(g);
    case 'H-LINK-07':
      return hLink07(g);
    case 'H-LINK-08':
      return hLink08(g);
  }
}

/** 全ルールを定義順に評価し、 Violation を平坦化して返す。 */
export function evaluateAll(g: ContractGraph): Violation[] {
  return RULE_IDS.flatMap((id) => evaluateRule(id, g));
}
