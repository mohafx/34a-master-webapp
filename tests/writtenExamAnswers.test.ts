import { describe, expect, it } from 'vitest';
import { areAnswerSetsEqual, getAnswerKeys, getRequiredAnswerCount, scoreQuestionPoints } from '../src/utils/writtenExamAnswers';

describe('written exam answer helpers', () => {
  it('normalizes casing, spaces, and answer order', () => {
    expect(getAnswerKeys(' d, b ')).toEqual(['B', 'D']);
    expect(areAnswerSetsEqual('B, D', ['d', 'b'])).toBe(true);
  });

  it('keeps wrong extra or missing answers incorrect', () => {
    expect(areAnswerSetsEqual('B,D', ['B'])).toBe(false);
    expect(areAnswerSetsEqual('B,D', ['B', 'D', 'E'])).toBe(false);
  });

  it('returns the required answer count for simulation hints and limits', () => {
    expect(getRequiredAnswerCount('B, D')).toBe(2);
    expect(getRequiredAnswerCount('f')).toBe(1);
  });

  it('scores single choice with one point only for the exact correct answer', () => {
    expect(scoreQuestionPoints('B', 'B')).toBe(1);
    expect(scoreQuestionPoints('B', 'A')).toBe(0);
    expect(scoreQuestionPoints('B', 'A,B')).toBe(0);
  });

  it('scores multiple choice with one point per correct selected answer', () => {
    expect(scoreQuestionPoints('B,D', 'B,D')).toBe(2);
    expect(scoreQuestionPoints('B,D', 'B')).toBe(1);
    expect(scoreQuestionPoints('B,D', 'B,E')).toBe(1);
    expect(scoreQuestionPoints('B,D', 'E,F')).toBe(0);
    expect(scoreQuestionPoints('B, D', 'D, B')).toBe(2);
  });
});
