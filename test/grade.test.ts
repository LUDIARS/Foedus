import { describe, it, expect } from 'vitest';
import { computeGrade } from '../src/report/grade.ts';

describe('computeGrade', () => {
  it('critical≥1 → D', () => {
    expect(computeGrade({ critical: 1, high: 0, medium: 0, low: 0 })).toBe('D');
  });
  it('high≥1 → C', () => {
    expect(computeGrade({ critical: 0, high: 2, medium: 5, low: 1 })).toBe('C');
  });
  it('medium|low のみ → B', () => {
    expect(computeGrade({ critical: 0, high: 0, medium: 1, low: 0 })).toBe('B');
    expect(computeGrade({ critical: 0, high: 0, medium: 0, low: 3 })).toBe('B');
  });
  it('0 → A', () => {
    expect(computeGrade({ critical: 0, high: 0, medium: 0, low: 0 })).toBe('A');
  });
});
