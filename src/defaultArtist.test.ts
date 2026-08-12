import { describe, expect, it } from 'vitest';
import { derive, type SceneInput } from './derive.js';
import { SCENE_PATTERNS } from './namePattern.js';
import { planDefaultArtist } from './defaultArtist.js';
import type { SceneFields } from './roles.js';

const scene = (i: number, name: string): SceneInput => ({
  i,
  name,
  tempo: -1,
  colorIndex: -1,
});

const fields = (scenes: readonly SceneInput[]): SceneFields[] =>
  scenes.map((s) => ({
    s: s.i,
    name: s.name,
    tempo: s.tempo,
    colorIndex: s.colorIndex,
    color: 0,
  }));

const plan = (scenes: readonly SceneInput[], artist = 'The Aviators') =>
  planDefaultArtist(derive(scenes, SCENE_PATTERNS), fields(scenes), artist);

describe('planDefaultArtist', () => {
  it('fills every scene of an artistless song and preserves each role', () => {
    const p = plan([
      scene(0, '[INTRO] @Bm NIGHTFALL'),
      scene(1, '[CHORUS] @Bm NIGHTFALL'),
    ]);

    expect(p.songs).toEqual(['NIGHTFALL']);
    expect(p.conflicts).toEqual([]);
    expect(p.ops).toEqual([
      { s: 0, name: '[INTRO] @Bm NIGHTFALL - THE AVIATORS' },
      { s: 1, name: '[CHORUS] @Bm NIGHTFALL - THE AVIATORS' },
    ]);
  });

  it('completes blanks when the song already states the default artist', () => {
    const p = plan([
      scene(0, 'NIGHTFALL - THE AVIATORS'),
      scene(1, 'NIGHTFALL'),
    ]);

    expect(p.songs).toEqual(['NIGHTFALL']);
    expect(p.ops).toEqual([{ s: 1, name: 'NIGHTFALL - THE AVIATORS' }]);
  });

  it('leaves a partially-filled song alone when it names another artist', () => {
    const p = plan([
      scene(0, 'NIGHTFALL - SUN & STEEL'),
      scene(1, 'NIGHTFALL'),
    ]);

    expect(p.songs).toEqual([]);
    expect(p.ops).toEqual([]);
    expect(p.conflicts).toEqual([{ song: 'NIGHTFALL', artists: ['SUN & STEEL'] }]);
  });

  it('does not report a fully-named song as a skipped blank', () => {
    const p = plan([scene(0, 'NIGHTFALL - SUN & STEEL')]);
    expect(p.conflicts).toEqual([]);
    expect(p.ops).toEqual([]);
  });

  it('refuses to fill blanks in a song whose scenes already disagree', () => {
    const p = plan([
      scene(0, 'NIGHTFALL - THE AVIATORS'),
      scene(1, 'NIGHTFALL - SUN & STEEL'),
      scene(2, 'NIGHTFALL'),
    ]);

    expect(p.ops).toEqual([]);
    expect(p.conflicts).toEqual([
      { song: 'NIGHTFALL', artists: ['THE AVIATORS', 'SUN & STEEL'] },
    ]);
  });

  it('does nothing without a configured default', () => {
    const p = plan([scene(0, 'NIGHTFALL')], '   ');
    expect(p).toEqual({ artist: '', songs: [], conflicts: [], ops: [] });
  });
});
