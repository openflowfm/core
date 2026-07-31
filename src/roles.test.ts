import { describe, expect, it } from 'vitest';
import {
  countUnrevertableColors,
  findRole,
  inverseSceneOps,
  isValidRoleName,
  mergeVocabulary,
  nameWithoutRole,
  roleIn,
  roleKey,
  roleOps,
  rolesInUse,
  sceneColorOps,
  withRole,
  type Role,
  type SceneFields,
} from './roles.js';

describe('roleIn', () => {
  it('reads a trailing tag', () => {
    expect(roleIn('Nightfall 128 Bm [chorus]')).toBe('chorus');
  });

  it('reads a tag that is not at the end', () => {
    expect(roleIn('[intro] Nightfall')).toBe('intro');
  });

  it('is null when there is no tag', () => {
    expect(roleIn('Nightfall 128 Bm')).toBeNull();
  });

  it('is null for an empty tag', () => {
    expect(roleIn('Nightfall []')).toBeNull();
  });

  it('takes the last valid tag, matching where withRole writes one', () => {
    expect(roleIn('Nightfall [intro] [chorus]')).toBe('chorus');
  });

  it('ignores a tag that is not a legal role name', () => {
    // A scene may carry brackets for its own reasons; only things that look
    // like role names are read as roles.
    expect(roleIn('Nightfall [take 2 / alt]')).toBeNull();
    expect(roleIn('Nightfall [!!!]')).toBeNull();
  });

  it('skips an illegal tag in favour of a legal earlier one', () => {
    expect(roleIn('Nightfall [chorus] [b/w mix]')).toBe('chorus');
  });

  it('keeps the case actually written', () => {
    expect(roleIn('Nightfall [Chorus]')).toBe('Chorus');
  });

  it('tidies whitespace inside the tag', () => {
    expect(roleIn('Nightfall [post  chorus]')).toBe('post chorus');
  });
});

describe('isValidRoleName', () => {
  it('accepts ordinary role names', () => {
    for (const s of ['intro', 'verse', 'post chorus', 'jam 2', "drop-a", 'call & response']) {
      expect(isValidRoleName(s), s).toBe(true);
    }
  });

  it('rejects empty, bracketed, punctuated and over-long names', () => {
    for (const s of ['', '   ', '[x]', 'a/b', 'a,b', '-lead', 'x'.repeat(25)]) {
      expect(isValidRoleName(s), JSON.stringify(s)).toBe(false);
    }
  });
});

describe('roleKey', () => {
  it('matches case-insensitively so a hand-typed tag is the same role', () => {
    expect(roleKey('Chorus')).toBe(roleKey('chorus'));
    expect(roleKey('post  Chorus ')).toBe('post chorus');
  });
});

describe('withRole', () => {
  it('appends a tag to an untagged name', () => {
    expect(withRole('Nightfall 128 Bm', 'chorus')).toBe('Nightfall 128 Bm [chorus]');
  });

  it('replaces an existing tag in place rather than appending a second', () => {
    expect(withRole('Nightfall 128 Bm [verse]', 'chorus')).toBe(
      'Nightfall 128 Bm [chorus]',
    );
    expect(withRole('[intro] Nightfall', 'chorus')).toBe('[chorus] Nightfall');
  });

  it('removes the tag when the role is null, leaving no double space', () => {
    expect(withRole('Nightfall 128 Bm [chorus]', null)).toBe('Nightfall 128 Bm');
    expect(withRole('[intro] Nightfall', null)).toBe('Nightfall');
  });

  it('leaves an untagged name alone when clearing', () => {
    expect(withRole('Nightfall 128 Bm', null)).toBe('Nightfall 128 Bm');
  });

  it('tags an empty name without a leading space', () => {
    expect(withRole('', 'chorus')).toBe('[chorus]');
  });

  it('round-trips: tagging twice replaces, never accumulates', () => {
    const once = withRole('Nightfall', 'verse');
    const twice = withRole(once, 'chorus');
    expect(twice).toBe('Nightfall [chorus]');
    expect(nameWithoutRole(twice)).toBe('Nightfall');
  });

  it('leaves a bracket group that is not a role alone', () => {
    expect(withRole('Nightfall [alt mix/b]', 'chorus')).toBe(
      'Nightfall [alt mix/b] [chorus]',
    );
  });
});

describe('rolesInUse', () => {
  it('lists roles in order of first appearance', () => {
    expect(
      rolesInUse(['A [intro]', 'B [verse]', 'C [chorus]', 'D [verse]', 'E']),
    ).toEqual(['intro', 'verse', 'chorus']);
  });

  it('dedupes case-insensitively, keeping the first spelling seen', () => {
    expect(rolesInUse(['A [Chorus]', 'B [chorus]'])).toEqual(['Chorus']);
  });

  it('is empty for a set with no tags', () => {
    expect(rolesInUse(['A', 'B', ''])).toEqual([]);
  });
});

describe('mergeVocabulary', () => {
  const configured: Role[] = [
    { name: 'intro', colorIndex: 8 },
    { name: 'chorus', colorIndex: 14 },
  ];

  it('keeps configured order and appends unconfigured roles found in the set', () => {
    expect(mergeVocabulary(configured, ['chorus', 'jam'])).toEqual([
      { name: 'intro', colorIndex: 8 },
      { name: 'chorus', colorIndex: 14 },
      { name: 'jam', colorIndex: -1 },
    ]);
  });

  it('gives an unconfigured role -1, not slot 0', () => {
    // Slot 0 is a real color; "nobody chose one" needs its own value.
    expect(mergeVocabulary([], ['jam'])[0]!.colorIndex).toBe(-1);
  });

  it('matches configured entries case-insensitively', () => {
    expect(mergeVocabulary(configured, ['Chorus'])).toHaveLength(2);
  });

  it('drops duplicate and blank configured entries', () => {
    const dupes: Role[] = [
      { name: 'jam', colorIndex: 1 },
      { name: 'JAM', colorIndex: 2 },
      { name: '  ', colorIndex: 3 },
    ];
    expect(mergeVocabulary(dupes, [])).toEqual([{ name: 'jam', colorIndex: 1 }]);
  });
});

describe('findRole', () => {
  const vocab: Role[] = [{ name: 'Chorus', colorIndex: 14 }];

  it('matches case-insensitively', () => {
    expect(findRole(vocab, 'chorus')?.colorIndex).toBe(14);
  });

  it('is undefined for a role that is not there', () => {
    expect(findRole(vocab, 'jam')).toBeUndefined();
  });
});

// Scene 0 is uncolored (-1), scenes 1 and 2 carry real colors.
const BEFORE: SceneFields[] = [
  { s: 0, name: 'Nightfall 128 Bm', colorIndex: -1, color: 0x000000 },
  { s: 1, name: 'Nightfall 128 Bm [verse]', colorIndex: 14, color: 0xff3636 },
  { s: 2, name: 'Nightfall 128 Bm [chorus]', colorIndex: 3, color: 0xf7f47c },
];

describe('roleOps', () => {
  it('tags the scenes that would actually change', () => {
    expect(roleOps(BEFORE, [0, 1], 'chorus')).toEqual([
      { s: 0, name: 'Nightfall 128 Bm [chorus]' },
      { s: 1, name: 'Nightfall 128 Bm [chorus]' },
    ]);
  });

  it('drops scenes already carrying that role', () => {
    expect(roleOps(BEFORE, [1, 2], 'chorus')).toEqual([
      { s: 1, name: 'Nightfall 128 Bm [chorus]' },
    ]);
  });

  it('clears a role', () => {
    expect(roleOps(BEFORE, [2], null)).toEqual([{ s: 2, name: 'Nightfall 128 Bm' }]);
  });

  it('drops a clear on a scene that has no role', () => {
    expect(roleOps(BEFORE, [0], null)).toEqual([]);
  });

  it('skips scenes it has no "before" for', () => {
    expect(roleOps(BEFORE, [99], 'chorus')).toEqual([]);
  });
});

describe('sceneColorOps', () => {
  it('writes the index and the RGB together', () => {
    expect(sceneColorOps(BEFORE, [0], 41, 0x92a7ff)).toEqual([
      { s: 0, colorIndex: 41, color: 0x92a7ff },
    ]);
  });

  it('drops scenes already that color', () => {
    expect(sceneColorOps(BEFORE, [1, 2], 14, 0xff3636)).toEqual([
      { s: 2, colorIndex: 14, color: 0xff3636 },
    ]);
  });

  it('writes an uncolored scene — -1 is not a color it already has', () => {
    expect(sceneColorOps(BEFORE, [0], 0, 0xff94a6)).toHaveLength(1);
  });
});

describe('inverseSceneOps', () => {
  it('restores the previous name', () => {
    const ops = [{ s: 2, name: 'Nightfall 128 Bm [jam]' }];
    expect(inverseSceneOps(BEFORE, ops)).toEqual([
      { s: 2, name: 'Nightfall 128 Bm [chorus]' },
    ]);
  });

  it('restores the previous color as an index and an RGB', () => {
    const ops = [{ s: 1, colorIndex: 41, color: 0x92a7ff }];
    expect(inverseSceneOps(BEFORE, ops)).toEqual([
      { s: 1, colorIndex: 14, color: 0xff3636 },
    ]);
  });

  it('cannot un-color a scene that had no color, and says nothing rather than guessing', () => {
    // Live has no writable "no color", so slot 0 would be an undo that leaves
    // the scene a color it never had.
    const ops = [{ s: 0, colorIndex: 41, color: 0x92a7ff }];
    expect(inverseSceneOps(BEFORE, ops)).toEqual([]);
  });

  it('still reverses the name half of a write it cannot fully undo', () => {
    const ops = [{ s: 0, name: 'X [jam]', colorIndex: 41, color: 0x92a7ff }];
    expect(inverseSceneOps(BEFORE, ops)).toEqual([{ s: 0, name: 'Nightfall 128 Bm' }]);
  });

  it('never reverts a field the op did not write', () => {
    const ops = [{ s: 1, colorIndex: 41, color: 0x92a7ff }];
    expect(inverseSceneOps(BEFORE, ops)[0]).not.toHaveProperty('name');
  });

  it('skips unknown scenes and writes that change nothing', () => {
    expect(
      inverseSceneOps(BEFORE, [
        { s: 99, name: 'X' },
        { s: 1, colorIndex: 14, color: 0xff3636 },
      ]),
    ).toEqual([]);
  });

  it('round-trips a role assignment back to the original names', () => {
    const ops = roleOps(BEFORE, [0, 1, 2], 'jam');
    expect(inverseSceneOps(BEFORE, ops)).toEqual([
      { s: 0, name: 'Nightfall 128 Bm' },
      { s: 1, name: 'Nightfall 128 Bm [verse]' },
      { s: 2, name: 'Nightfall 128 Bm [chorus]' },
    ]);
  });
});

describe('countUnrevertableColors', () => {
  it('counts scenes that had no color and are about to get one', () => {
    const ops = [
      { s: 0, colorIndex: 41, color: 0x92a7ff },
      { s: 1, colorIndex: 41, color: 0x92a7ff },
    ];
    expect(countUnrevertableColors(BEFORE, ops)).toBe(1);
  });

  it('is zero for name-only writes', () => {
    expect(countUnrevertableColors(BEFORE, roleOps(BEFORE, [0, 1], 'jam'))).toBe(0);
  });
});
