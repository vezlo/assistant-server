import { buildDepthSystemPrompt } from '../services/depth-prompt.service';

describe('buildDepthSystemPrompt', () => {
  it.each([1, 2, 3, 4, 5])('returns a non-empty string for level %i', (level) => {
    const prompt = buildDepthSystemPrompt(level);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('level 1 prompt contains anti-code instructions', () => {
    const prompt = buildDepthSystemPrompt(1);
    expect(prompt).toContain('NEVER');
    expect(prompt).toContain('code snippets');
    expect(prompt).toContain('Executive');
  });

  it('level 2 prompt forbids code but allows feature names', () => {
    const prompt = buildDepthSystemPrompt(2);
    expect(prompt).toContain('NEVER');
    expect(prompt).toContain('code snippets');
    expect(prompt).toContain('Support');
    expect(prompt).toContain('feature names');
  });

  it('level 3 prompt is balanced (default)', () => {
    const prompt = buildDepthSystemPrompt(3);
    expect(prompt).toContain('General');
    expect(prompt).toContain('only when they directly answer');
  });

  it('level 4 prompt encourages code excerpts', () => {
    const prompt = buildDepthSystemPrompt(4);
    expect(prompt).toContain('Technical');
    expect(prompt).toContain('code excerpts');
    expect(prompt).toContain('file paths');
  });

  it('level 5 prompt contains pro-code instructions', () => {
    const prompt = buildDepthSystemPrompt(5);
    expect(prompt).toContain('Developer');
    expect(prompt).toContain('full code snippets');
    expect(prompt).toContain('line references');
    expect(prompt).toContain('call graphs');
  });

  it('all levels require matching response language', () => {
    for (let level = 1; level <= 5; level++) {
      const prompt = buildDepthSystemPrompt(level);
      expect(prompt).toContain('must match');
    }
  });

  it('all levels prohibit translating code terms', () => {
    for (let level = 1; level <= 5; level++) {
      const prompt = buildDepthSystemPrompt(level);
      expect(prompt).toContain('NEVER');
      expect(prompt).toContain('translated');
    }
  });

  it('clamps values below 1 to level 1', () => {
    const prompt = buildDepthSystemPrompt(0);
    expect(prompt).toContain('Executive');
  });

  it('clamps values above 5 to level 5', () => {
    const prompt = buildDepthSystemPrompt(6);
    expect(prompt).toContain('Developer');
  });

  it('rounds float values to nearest integer', () => {
    const prompt = buildDepthSystemPrompt(3.7);
    expect(prompt).toContain('Technical'); // rounds to 4
  });

  it('each level produces a distinct prompt', () => {
    const prompts = [1, 2, 3, 4, 5].map(buildDepthSystemPrompt);
    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBe(5);
  });
});
