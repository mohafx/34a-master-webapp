import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface ScenarioFixture {
  id: string;
  title: string;
  topic: string;
  brief: string;
  expected: string;
}

function readScenarioFixtures(): ScenarioFixture[] {
  const source = readFileSync('supabase/functions/oral-exam-session/index.ts', 'utf8');
  const match = source.match(/const ORAL_EXAM_SCENARIOS: OralExamScenario\[\] = \[([\s\S]*?)\];/);
  if (!match) throw new Error('ORAL_EXAM_SCENARIOS not found');

  const objectBlocks = match[1].match(/\{[\s\S]*?\}/g) ?? [];
  return objectBlocks.map((block) => {
    const get = (key: keyof ScenarioFixture) => {
      const valueMatch = block.match(new RegExp(`${key}:\\s*"([^"]+)"`));
      if (!valueMatch) throw new Error(`Scenario field missing: ${key}`);
      return valueMatch[1];
    };
    return {
      id: get('id'),
      title: get('title'),
      topic: get('topic'),
      brief: get('brief'),
      expected: get('expected'),
    };
  });
}

describe('oral exam scenarios', () => {
  it('keeps the curated scenario pool complete and valid', () => {
    const scenarios = readScenarioFixtures();
    const ids = scenarios.map((scenario) => scenario.id);

    expect(scenarios).toHaveLength(12);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'zutritt-ohne-ausweis',
      'aggressiver-kunde',
      'ladendiebstahl-beobachtet',
      'fundgeldboerse',
      'randalierer-parkplatz',
      'datenschutz-kamera',
      'alkoholisierter-gast',
      'brandmeldealarm',
      'verdaechtige-tasche',
      'mitarbeiter-will-daten',
      'notwehr-grenze',
      'gewerberecht-befugnisse',
    ]);

    for (const scenario of scenarios) {
      expect(scenario.title.length).toBeGreaterThan(4);
      expect(scenario.topic.length).toBeGreaterThan(6);
      expect(scenario.brief.length).toBeGreaterThan(30);
      expect(scenario.expected.length).toBeGreaterThan(40);
      expect(scenario.brief).not.toBe(scenario.expected);
    }
  });
});
