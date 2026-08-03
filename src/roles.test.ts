import { describe, expect, it } from 'vitest';
import {
  countUnrevertableColors,
  findRole,
  findRoleProblems,
  inverseSceneOps,
  isValidRoleName,
  mergeVocabulary,
  nameWithoutRole,
  roleIn,
  roleKey,
  roleOps,
  rolesInUse,
  sceneColorOps,
  sharedRole,
  tempoOps,
  withRole,
  type Role,
  type SceneFields,
} from './roles.js';
import { MIN_TEMPO } from './derive.js';

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
  it('prepends a tag to an untagged name', () => {
    expect(withRole('@128-Bm NIGHTFALL', 'chorus')).toBe('[CHORUS] @128-Bm NIGHTFALL');
  });

  it('writes the tag in caps, matching the song', () => {
    // Appearance only — `roleKey` folds case, so a role typed by hand in Live
    // still matches the vocabulary.
    expect(withRole('NIGHTFALL', 'post chorus')).toBe('[POST CHORUS] NIGHTFALL');
    expect(roleKey(roleIn(withRole('NIGHTFALL', 'Chorus'))!)).toBe('chorus');
  });

  it('replaces an existing tag in place rather than appending a second', () => {
    // In place, not always-prepend: a set still on the old convention keeps its
    // shape until `titleOps` rewrites the whole name.
    expect(withRole('Nightfall 128 Bm [verse]', 'chorus')).toBe(
      'Nightfall 128 Bm [CHORUS]',
    );
    expect(withRole('[INTRO] NIGHTFALL', 'chorus')).toBe('[CHORUS] NIGHTFALL');
  });

  it('removes the tag when the role is null, leaving no double space', () => {
    expect(withRole('Nightfall 128 Bm [chorus]', null)).toBe('Nightfall 128 Bm');
    expect(withRole('[intro] Nightfall', null)).toBe('Nightfall');
  });

  it('leaves an untagged name alone when clearing', () => {
    expect(withRole('Nightfall 128 Bm', null)).toBe('Nightfall 128 Bm');
  });

  it('tags an empty name without a trailing space', () => {
    expect(withRole('', 'chorus')).toBe('[CHORUS]');
  });

  it('round-trips: tagging twice replaces, never accumulates', () => {
    const once = withRole('NIGHTFALL', 'verse');
    const twice = withRole(once, 'chorus');
    expect(twice).toBe('[CHORUS] NIGHTFALL');
    expect(nameWithoutRole(twice)).toBe('NIGHTFALL');
  });

  it('leaves a bracket group that is not a role alone', () => {
    // `alt mix/b` has a `/`, which isn't in ROLE_CHARS — so it isn't a role,
    // and the new tag goes to the front rather than replacing it.
    expect(withRole('NIGHTFALL [alt mix/b]', 'chorus')).toBe(
      '[CHORUS] NIGHTFALL [alt mix/b]',
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

describe('sharedRole', () => {
  const names = new Map<number, string>([
    [0, '[chorus] @128-Bm NIGHTFALL'],
    [1, '[Chorus] @128-Bm NIGHTFALL'],
    [2, '[verse] @128-Bm NIGHTFALL'],
    [3, '@128-Bm NIGHTFALL'],
  ]);

  it('agrees across case, keeping the first spelling seen', () => {
    expect(sharedRole([0, 1], names)).toEqual({ currentRole: 'chorus', mixed: false });
  });

  it('is mixed when the scenes carry different roles', () => {
    expect(sharedRole([0, 2], names)).toEqual({ currentRole: null, mixed: true });
  });

  it('is mixed when a tagged scene meets an untagged one', () => {
    // Not "none": a picker that read this as no-role would offer to clear a
    // tag the user can see on the row above.
    expect(sharedRole([0, 3], names)).toEqual({ currentRole: null, mixed: true });
  });

  it('is none, not mixed, when no scene has a role', () => {
    expect(sharedRole([3], names)).toEqual({ currentRole: null, mixed: false });
  });

  it('treats a scene missing from the map as untagged', () => {
    expect(sharedRole([99], names)).toEqual({ currentRole: null, mixed: false });
  });

  it('is empty-handed for no scenes at all', () => {
    expect(sharedRole([], names)).toEqual({ currentRole: null, mixed: false });
  });
});

describe('findRoleProblems', () => {
  it('passes a clean draft', () => {
    expect(
      findRoleProblems([
        { name: 'intro', colorIndex: 0 },
        { name: 'chorus', colorIndex: -1 },
      ]).size,
    ).toBe(0);
  });

  it('flags names that are not legal role names', () => {
    expect(
      findRoleProblems([
        { name: '', colorIndex: -1 },
        { name: 'a/b', colorIndex: -1 },
        { name: 'jam', colorIndex: -1 },
      ]),
    ).toEqual(new Set([0, 1]));
  });

  it('flags every duplicate after the first, matched by roleKey', () => {
    expect(
      findRoleProblems([
        { name: 'Chorus', colorIndex: 2 },
        { name: 'chorus ', colorIndex: 5 },
        { name: 'CHORUS', colorIndex: -1 },
      ]),
    ).toEqual(new Set([1, 2]));
  });
});

// Scene 0 is uncolored (-1), scenes 1 and 2 carry real colors. Scene 2 is the
// only one with a tempo of its own.
const BEFORE: SceneFields[] = [
  { s: 0, name: '@128-Bm NIGHTFALL', colorIndex: -1, color: 0x000000, tempo: -1 },
  { s: 1, name: '[VERSE] @128-Bm NIGHTFALL', colorIndex: 14, color: 0xff3636, tempo: -1 },
  { s: 2, name: '[CHORUS] @128-Bm NIGHTFALL', colorIndex: 3, color: 0xf7f47c, tempo: 128 },
];

describe('roleOps', () => {
  it('tags the scenes that would actually change', () => {
    expect(roleOps(BEFORE, [0, 1], 'chorus')).toEqual([
      { s: 0, name: '[CHORUS] @128-Bm NIGHTFALL' },
      { s: 1, name: '[CHORUS] @128-Bm NIGHTFALL' },
    ]);
  });

  it('drops scenes already carrying that role', () => {
    expect(roleOps(BEFORE, [1, 2], 'chorus')).toEqual([
      { s: 1, name: '[CHORUS] @128-Bm NIGHTFALL' },
    ]);
  });

  it('clears a role', () => {
    expect(roleOps(BEFORE, [2], null)).toEqual([{ s: 2, name: '@128-Bm NIGHTFALL' }]);
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
    const ops = [{ s: 2, name: '[JAM] @128-Bm NIGHTFALL' }];
    expect(inverseSceneOps(BEFORE, ops)).toEqual([
      { s: 2, name: '[CHORUS] @128-Bm NIGHTFALL' },
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
    expect(inverseSceneOps(BEFORE, ops)).toEqual([{ s: 0, name: '@128-Bm NIGHTFALL' }]);
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
      { s: 0, name: '@128-Bm NIGHTFALL' },
      { s: 1, name: '[VERSE] @128-Bm NIGHTFALL' },
      { s: 2, name: '[CHORUS] @128-Bm NIGHTFALL' },
    ]);
  });
});

describe('tempoOps', () => {
  it('sets a tempo on scenes that had none', () => {
    expect(tempoOps(BEFORE, [0, 1], 130)).toEqual([
      { s: 0, tempo: 130 },
      { s: 1, tempo: 130 },
    ]);
  });

  it('drops scenes already at that tempo', () => {
    expect(tempoOps(BEFORE, [1, 2], 128)).toEqual([{ s: 1, tempo: 128 }]);
  });

  it('clears a tempo when given null, and only where there is one to clear', () => {
    // Scenes 0 and 1 already follow the song, so clearing them writes nothing.
    expect(tempoOps(BEFORE, [0, 1, 2], null)).toEqual([{ s: 2, tempo: -1 }]);
  });

  it('treats anything below Live’s lower bound as "clear"', () => {
    expect(tempoOps(BEFORE, [2], 0)).toEqual([{ s: 2, tempo: -1 }]);
    expect(tempoOps(BEFORE, [2], MIN_TEMPO - 1)).toEqual([{ s: 2, tempo: -1 }]);
  });

  it('does not confuse Live’s -1 with gnum’s 0 when comparing', () => {
    // A scene reading back 0 because the property was unreadable is already
    // "no tempo", so asking to clear it writes nothing.
    const odd: SceneFields[] = [{ ...BEFORE[0]!, tempo: 0 }];
    expect(tempoOps(odd, [0], null)).toEqual([]);
  });

  it('skips scenes it has no "before" for', () => {
    expect(tempoOps(BEFORE, [99], 130)).toEqual([]);
  });
});

describe('inverseSceneOps for tempo', () => {
  it('puts back a tempo that was overwritten', () => {
    expect(inverseSceneOps(BEFORE, [{ s: 2, tempo: 140 }])).toEqual([
      { s: 2, tempo: 128 },
    ]);
  });

  it('reverses turning a tempo on, unlike color', () => {
    // "No tempo of its own" is a state Live accepts a write for, where "no
    // color" is not — so this revert is real where the color one is dropped.
    expect(inverseSceneOps(BEFORE, [{ s: 0, tempo: 130 }])).toEqual([
      { s: 0, tempo: -1 },
    ]);
  });

  it('reverses turning a tempo off', () => {
    expect(inverseSceneOps(BEFORE, [{ s: 2, tempo: -1 }])).toEqual([
      { s: 2, tempo: 128 },
    ]);
  });

  it('skips a tempo write that changes nothing', () => {
    expect(inverseSceneOps(BEFORE, [{ s: 2, tempo: 128 }])).toEqual([]);
    expect(inverseSceneOps(BEFORE, [{ s: 0, tempo: -1 }])).toEqual([]);
  });

  it('round-trips a whole song through set and back', () => {
    const ops = tempoOps(BEFORE, [0, 1, 2], 140);
    expect(inverseSceneOps(BEFORE, ops)).toEqual([
      { s: 0, tempo: -1 },
      { s: 1, tempo: -1 },
      { s: 2, tempo: 128 },
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
