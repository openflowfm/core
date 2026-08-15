import { describe, expect, it } from 'vitest';
import { derive, type SceneInput } from './derive.js';
import { compilePattern, SCENE_PATTERNS } from './namePattern.js';
import { buildSetModel, songAt } from './setModel.js';

function scene(i: number, name: string, tempo = -1, colorIndex = -1): SceneInput {
  return { i, name, tempo, colorIndex };
}

const model = (scenes: SceneInput[], rev = 7) =>
  buildSetModel(derive(scenes, SCENE_PATTERNS), rev);

describe('buildSetModel', () => {
  it('carries the songs with their facts already rendered', () => {
    const m = model([
      scene(0, '[INTRO] @Bm NIGHTFALL - THE AVIATORS {COVER}'),
      scene(1, '[VERSE] @Bm NIGHTFALL - THE AVIATORS {COVER}'),
    ]);
    expect(m.rev).toBe(7);
    expect(m.songs).toHaveLength(1);
    expect(m.songs[0]).toMatchObject({
      songKey: 'nightfall',
      name: 'NIGHTFALL',
      scenes: [0, 1],
      key: 'Bm',
      artist: 'THE AVIATORS',
      tag: 'COVER',
      keyClash: false,
      artistClash: false,
    });
  });

  it('renders a disagreement rather than picking a side', () => {
    const m = model([scene(0, '@Bm NIGHTFALL'), scene(1, '@F#m NIGHTFALL')]);
    expect(m.songs[0]!.key).toBe('Bm / F#m');
    expect(m.songs[0]!.keyClash).toBe(true);
  });

  it('falls back to the first scene’s tempo when the names state no bpm', () => {
    const m = model([scene(0, 'NIGHTFALL', 128), scene(1, 'NIGHTFALL')]);
    expect(m.songs[0]!.bpm).toBe('128');
    expect(m.songs[0]!.firstSceneTempo).toBe(128);
    expect(m.songs[0]!.tempoScenes).toEqual([0]);
  });

  it('reports every scene still carrying its own tempo', () => {
    const m = model([scene(0, 'NIGHTFALL', 128), scene(1, 'NIGHTFALL', 128)]);
    expect(m.songs[0]!.tempoScenes).toEqual([0, 1]);
  });

  it('separates an uncolored song from one colored inconsistently', () => {
    const none = model([scene(0, 'NIGHTFALL'), scene(1, 'NIGHTFALL')]);
    expect(none.songs[0]).toMatchObject({ colorIndex: -1, colorClash: false });

    const clash = model([scene(0, 'NIGHTFALL', -1, 3), scene(1, 'NIGHTFALL', -1, 9)]);
    expect(clash.songs[0]).toMatchObject({ colorIndex: -1, colorClash: true });

    const one = model([scene(0, 'NIGHTFALL', -1, 3), scene(1, 'NIGHTFALL', -1, 3)]);
    expect(one.songs[0]).toMatchObject({ colorIndex: 3, colorClash: false });
  });

  it('maps every scene of every block, reprises included', () => {
    const m = model([
      scene(0, 'NIGHTFALL'),
      scene(1, 'GLASS TUNNEL'),
      scene(2, 'NIGHTFALL'),
    ]);
    expect(m.songByScene).toEqual({ '0': 'nightfall', '1': 'glass tunnel', '2': 'nightfall' });
    expect(m.songs[0]!.blocks).toEqual([
      { from: 0, to: 0 },
      { from: 2, to: 2 },
    ]);
  });

  it('reports scenes no pattern reads, and maps them to nothing', () => {
    // A pattern that only matches a bracketed role leaves a bare name unread.
    const strict = compilePattern('[{role}]')!;
    const m = buildSetModel(derive([scene(0, 'nothing matches this')], strict), 1);
    expect(m.unmapped).toEqual([0]);
    expect(m.songByScene).toEqual({});
    expect(songAt(m, 0)).toBeUndefined();
  });

  it('survives the round trip it exists to make', () => {
    const m = model([scene(0, '@Bm NIGHTFALL - THE AVIATORS {COVER}', 128, 3)]);
    const wire: BSV.SetModel = JSON.parse(JSON.stringify(m));
    expect(wire).toEqual(m);
    expect(songAt(wire, 0)?.name).toBe('NIGHTFALL');
  });
});
