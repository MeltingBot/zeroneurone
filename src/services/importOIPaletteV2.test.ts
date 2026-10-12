import { describe, it, expect } from 'vitest';
import { convertPaletteV2, isOIPaletteV2Format, type PaletteV2Graph } from './importOIPaletteV2';
import { isOIPaletteFormat } from './importOIPalette';
import type { DossierId } from '../types';

const DOSSIER = 'dossier-1' as DossierId;

const v = (type: string, data: unknown) => ({ type, data, validation: null });

const graph: PaletteV2Graph = {
  schemaVersion: 2,
  nodes: [
    {
      id: 'search_email',
      x: 10,
      y: 20,
      source: 'user-entity',
      entity: { schemaVersion: 1, id: 'email', name: 'Email', iconName: 'mail', data: v('string', 'jdoe@example.com') },
    },
    {
      id: 'profile',
      x: 100,
      y: 200,
      source: 'search-result',
      parentId: 'search_email',
      entity: {
        schemaVersion: 1,
        id: '01a10ae7-0000',
        name: 'John Doe',
        iconName: 'https://cdn.osint.industries/modules/chess.png',
        metadata: { prettyName: 'Chess.com', kindLabel: 'Profile', annotation: 'Approximated' },
        data: v('object', {
          name: v('object', { kind: v('string', 'name'), value: v('string', 'John Doe') }),
          profile_url: v('url', 'https://chess.com/member/jdoe'),
          picture_url: v('image', 'data:image/png;base64,iVBORw0KGgo='),
          followers: v('number', 12),
          verified: v('boolean', false),
          creation_date: v('timestamp', 1706746886157),
          module_category: v('string', 'Gaming'),
          location_details: v('list', [
            v('object', { kind: v('string', 'location'), country: v('string', 'France'), latitude: v('number', 48.85), longitude: v('number', 2.35) }),
          ]),
          languages: v('list', [v('string', 'fr'), v('string', 'en')]),
          platform_variables: {
            schemaVersion: 1,
            id: 'object',
            data: v('object', {
              name_set: v('object', {
                kind: v('string', 'event'),
                start_date: v('timestamp', 1706746886157),
                description: v('string', 'Account Name Set'),
              }),
            }),
          },
        }),
      },
    },
    {
      id: 'breach',
      source: 'search-result',
      entity: {
        schemaVersion: 1,
        id: 'kiel_result',
        name: 'Poshmark',
        metadata: { prettyName: 'jdoe', database: 'poshmark' },
        data: v('object', { username: v('string', 'jdoe') }),
      },
    },
    {
      id: 'platforms',
      source: 'search-result',
      entity: {
        schemaVersion: 1,
        id: '01a10af4-0000',
        name: 'Account checkers',
        metadata: { prettyName: 'Macys' },
        data: v('platform_list', [
          { schemaVersion: 1, id: 'p1', data: v('platform', { name: 'Macys', category: 'E-commerce' }) },
          { schemaVersion: 1, id: 'p2', data: v('platform', { name: 'Instagram', category: 'Social Media' }) },
        ]),
      },
    },
    {
      id: 'maps',
      source: 'search-result',
      entity: {
        schemaVersion: 1,
        id: '01a10af0-1111',
        metadata: { prettyName: 'Google Maps', kindLabel: 'Profile' },
        data: v('list', [
          {
            schemaVersion: 1,
            id: 'review',
            data: v('object', {
              content: v('string', 'Great food'),
              published_at: v('timestamp', 1574878551108),
              platform_variables: {
                schemaVersion: 1,
                id: 'object',
                data: v('object', {
                  event: v('object', {
                    kind: v('string', 'event'),
                    start_date: v('timestamp', 1574878551108),
                    description: v('string', 'Review posted'),
                    location: v('object', {
                      kind: v('string', 'location'),
                      latitude: v('number', 33.72),
                      longitude: v('number', -117.77),
                      address: v('string', '3967 Irvine Blvd'),
                      popup: v('object', { subtitle: v('string', 'At Spice Palace') }),
                    }),
                  }),
                }),
              },
            }),
          },
          {
            schemaVersion: 1,
            id: 'contributor',
            data: v('object', { name: v('string', 'John D'), reviews: v('number', 5), module_category: v('string', 'Maps') }),
          },
        ]),
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'search_email', target: 'profile' },
    { id: 'e2', source: 'search_email', target: 'missing' },
  ],
};

describe('Graph Palette v2 import', () => {
  it('detects v2 exports, not v1 ones', () => {
    expect(isOIPaletteV2Format(graph)).toBe(true);
    expect(isOIPaletteFormat(graph)).toBe(true);
    expect(isOIPaletteV2Format({ nodes: [{ id: 'a', type: 'textNode', position: { x: 0, y: 0 }, data: {} }] })).toBe(false);
  });

  it('converts selectors, results and links', () => {
    const { elements, links, images } = convertPaletteV2(graph, DOSSIER);
    expect(elements).toHaveLength(5);
    const [email, profile, breach, platforms] = elements;

    expect(email.label).toBe('jdoe@example.com');
    expect(email.tags).toEqual(['Email']);
    expect(email.position).toEqual({ x: 10, y: 20 });

    expect(profile.label).toBe('Chess.com');
    expect(profile.tags).toEqual(['Gaming']);
    expect(profile.notes).toBe('Approximated');
    const props = Object.fromEntries(profile.properties.map(p => [p.key, p]));
    expect(props['Name'].value).toBe('John Doe');
    expect(props['Profile url']).toMatchObject({ value: 'https://chess.com/member/jdoe', type: 'link' });
    expect(props['Followers']).toMatchObject({ value: 12, type: 'number' });
    expect(props['Verified']).toMatchObject({ value: false, type: 'boolean' });
    expect(props['Creation date'].type).toBe('datetime');
    expect(props['Location details › Country'].value).toBe('France');
    expect(props['Languages'].value).toBe('fr, en');
    expect(props['module_id'].value).toBe('chess');
    expect(props['Module category']).toBeUndefined();
    expect(profile.geo).toEqual({ type: 'point', lat: 48.85, lng: 2.35 });
    expect(profile.events).toHaveLength(1);
    expect(profile.events[0].label).toBe('Account Name Set');
    expect(images.get(profile.id)).toMatch(/^data:image\/png/);

    expect(breach.label).toBe('Poshmark');
    expect(breach.tags).toEqual(['Fuite de données']);

    expect(platforms.label).toBe('Account checkers');
    expect(platforms.tags).toEqual(['Plateformes']);
    expect(platforms.properties.map(p => [p.key, p.value])).toEqual([
      ['Macys', 'E-commerce'],
      ['Instagram', 'Social Media'],
    ]);

    const maps = elements[4];
    expect(maps.label).toBe('Google Maps');
    expect(maps.tags).toEqual(['Maps']);
    expect(maps.properties.map(p => p.key)).toEqual(['Name', 'Reviews']);
    expect(maps.events).toHaveLength(1);
    expect(maps.events[0]).toMatchObject({
      label: 'Review posted — At Spice Palace',
      description: '3967 Irvine Blvd\n\nGreat food',
      geo: { type: 'point', lat: 33.72, lng: -117.77 },
    });
    expect(maps.geo).toEqual({ type: 'point', lat: 33.72, lng: -117.77 });

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ fromId: email.id, toId: profile.id });
  });
});
