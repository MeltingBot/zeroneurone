import { describe, it, expect } from 'vitest';
import {
  parseSourceLinks,
  hasSourceLinks,
  sourceToPlainText,
  sourceToMarkdown,
  sourceWebLinks,
  splitSourceItems,
  joinSourceLines,
  findAssetByHash,
  assetHashOf,
  targetValue,
  isValidPluginScheme,
  type SourceSegment,
} from './sourceLinks';

const roundTrip = (segments: SourceSegment[]) =>
  segments.map(s => (s.kind === 'text' ? s.text : s.raw)).join('');

describe('parseSourceLinks', () => {
  const cases = [
    'PV 12 du 03/02',
    'https://a.fr/x',
    '[P12](asset:3fa1c2d9) ; [P14](asset:8be07a11)',
    'voir [art](https://a.fr) p.3',
    '[x](javascript:alert(1))',
    'Pièce 12 [on:3fa1c2d9]',
    '[PV \\] annexe](asset:abcdef12)',
    '[a](data:text/html,x) [b](file:///etc) [c](blob:x) [d](mn:1a2b3c4d)',
    '',
  ];

  it.each(cases)('restitue exactement l\'entrée : %s', (input) => {
    expect(roundTrip(parseSourceLinks(input))).toBe(input);
  });

  it('texte sans lien → un segment texte', () => {
    expect(parseSourceLinks('PV 12 du 03/02')).toEqual([{ kind: 'text', text: 'PV 12 du 03/02' }]);
  });

  it('URL nue → un lien libellé par elle-même', () => {
    expect(parseSourceLinks('https://a.fr/x')).toEqual([
      { kind: 'link', label: 'https://a.fr/x', target: 'https://a.fr/x', scheme: 'https', raw: 'https://a.fr/x' },
    ]);
  });

  it('plusieurs URL nues, ponctuation finale exclue', () => {
    const segs = parseSourceLinks('https://www.google.com\nvoir https://www.yandex.com.');
    expect(segs.map(s => (s.kind === 'link' ? `<${s.target}>` : s.text))).toEqual([
      '<https://www.google.com>', '\nvoir ', '<https://www.yandex.com>', '.',
    ]);
    expect(sourceWebLinks('https://a.fr\n[b](https://b.fr)\nhttps://a.fr').map(l => l.target)).toEqual(['https://a.fr', 'https://b.fr']);
  });

  it('URL dans un lien Markdown : pas de second lien', () => {
    const segs = parseSourceLinks('[art](https://a.fr/x)');
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ label: 'art' });
  });

  it('URL sans hôte ou autre schéma → texte', () => {
    expect(hasSourceLinks('https:// ; ftp://a.fr ; www.a.fr')).toBe(false);
  });

  it('deux liens asset séparés', () => {
    const segs = parseSourceLinks('[P12](asset:3fa1c2d9) ; [P14](asset:8be07a11)');
    expect(segs.map(s => s.kind)).toEqual(['link', 'text', 'link']);
    expect(segs[0]).toMatchObject({ label: 'P12', target: 'asset:3fa1c2d9', scheme: 'asset' });
    expect(segs[1]).toEqual({ kind: 'text', text: ' ; ' });
  });

  it('texte, lien, texte', () => {
    const segs = parseSourceLinks('voir [art](https://a.fr) p.3');
    expect(segs.map(s => s.kind)).toEqual(['text', 'link', 'text']);
    expect(segs[1]).toMatchObject({ label: 'art', target: 'https://a.fr', scheme: 'https' });
  });

  it('javascript: n\'est jamais un lien', () => {
    expect(parseSourceLinks('[x](javascript:alert(1))')).toEqual([{ kind: 'text', text: '[x](javascript:alert(1))' }]);
    expect(hasSourceLinks('[x](javascript:void)')).toBe(false);
  });

  it('jeton [on:…] reste du texte', () => {
    expect(parseSourceLinks('Pièce 12 [on:3fa1c2d9]')).toEqual([{ kind: 'text', text: 'Pièce 12 [on:3fa1c2d9]' }]);
  });

  it('crochet échappé dans le libellé', () => {
    const segs = parseSourceLinks('[PV \\] annexe](asset:abcdef12)');
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ kind: 'link', label: 'PV ] annexe' });
  });

  it('schémas non autorisés → texte', () => {
    const segs = parseSourceLinks('[a](data:text/html,x) [b](file:///etc) [c](blob:x) [d](mn:1a2b3c4d)');
    expect(segs.every(s => s.kind === 'text')).toBe(true);
  });

  it('asset: exige au moins 8 hex', () => {
    expect(hasSourceLinks('[a](asset:3fa1c2d)')).toBe(false);
    expect(hasSourceLinks('[a](asset:zzzzzzzz)')).toBe(false);
    expect(hasSourceLinks('[a](asset:3FA1C2D9)')).toBe(true);
    expect(hasSourceLinks(`[a](asset:${'a'.repeat(64)})`)).toBe(true);
    expect(hasSourceLinks(`[a](asset:${'a'.repeat(65)})`)).toBe(false);
  });
});

describe('conversions', () => {
  const src = '[Pièce 12](asset:3fa1c2d9) ; [Article](https://a.fr/x) ; notes';

  it('texte brut : libellés seuls', () => {
    expect(sourceToPlainText(src)).toBe('Pièce 12 ; Article ; notes');
  });

  it('Markdown : liens web gardés, asset réduit au libellé', () => {
    expect(sourceToMarkdown(src)).toBe('Pièce 12 ; [Article](https://a.fr/x) ; notes');
  });

  it('URL web du champ, sans doublon', () => {
    const links = sourceWebLinks(`${src} ; [bis](https://a.fr/x) [c](http://b.fr)`);
    expect(links.map(l => [l.label, l.target])).toEqual([['Article', 'https://a.fr/x'], ['c', 'http://b.fr']]);
  });
});

describe('findAssetByHash', () => {
  const assets = [{ hash: 'abcdef0123456789' }, { hash: '3FA1C2D9ffff' }];

  it('préfixe insensible à la casse', () => {
    expect(findAssetByHash(assets, assetHashOf('asset:3fa1c2d9'))).toBe(assets[1]);
    expect(findAssetByHash(assets, 'ABCDEF01')).toBe(assets[0]);
  });

  it('absent → undefined', () => {
    expect(findAssetByHash(assets, '00000000')).toBeUndefined();
  });
});

describe('schémas de plugins', () => {
  const mn = new Set(['mn']);

  it('sans plugin enregistré, le schéma reste du texte', () => {
    expect(hasSourceLinks('[PV p.3](mn:1a2b3c4d)')).toBe(false);
  });

  it('avec le schéma enregistré, devient un lien', () => {
    const segs = parseSourceLinks('[PV p.3](mn:1a2b3c4d) ; [art](https://a.fr)', mn);
    expect(segs[0]).toMatchObject({ kind: 'link', label: 'PV p.3', target: 'mn:1a2b3c4d', scheme: 'mn' });
    expect(targetValue((segs[0] as { target: string }).target)).toBe('1a2b3c4d');
    expect(roundTrip(segs)).toBe('[PV p.3](mn:1a2b3c4d) ; [art](https://a.fr)');
  });

  it('cible vide → texte', () => {
    expect(hasSourceLinks('[a](mn:)', mn)).toBe(false);
  });

  it('un plugin ne peut pas réclamer un schéma réservé', () => {
    expect(hasSourceLinks('[x](javascript:void)', new Set(['javascript']))).toBe(false);
    expect(hasSourceLinks('[x](data:abc)', new Set(['data']))).toBe(false);
    expect(isValidPluginScheme('mn')).toBe(true);
    expect(isValidPluginScheme('x-ref.2')).toBe(true);
    for (const s of ['http', 'https', 'asset', 'javascript', 'vbscript', 'data', 'file', 'blob', 'MN', '1mn', '', 'm n']) {
      expect(isValidPluginScheme(s)).toBe(false);
    }
  });

  it('conversions : libellé seul, jamais un lien web', () => {
    const src = '[PV p.3](mn:1a2b3c4d) ; [art](https://a.fr)';
    expect(sourceToPlainText(src, mn)).toBe('PV p.3 ; art');
    expect(sourceToMarkdown(src, mn)).toBe('PV p.3 ; [art](https://a.fr)');
    expect(sourceWebLinks(src).map(l => l.target)).toEqual(['https://a.fr']);
  });
});

describe('splitSourceItems', () => {
  const items = (src: string) =>
    splitSourceItems(parseSourceLinks(src)).map(item =>
      item.map(s => (s.kind === 'link' ? `<${s.label}>` : s.text)).join(''));

  it('une source par ligne, espaces retirés', () => {
    expect(items('[P12](asset:3fa1c2d9)\n  [P14](asset:8be07a11)  \r\nnotes libres')).toEqual(['<P12>', '<P14>', 'notes libres']);
  });

  it('le « ; » ne sépare pas', () => {
    expect(items('PV 12; annexe ; [a](https://a.fr)')).toEqual(['PV 12; annexe ; <a>']);
  });

  it('texte et lien sur la même ligne', () => {
    expect(items('voir [art](https://a.fr) p.3\n[b](https://b.fr)')).toEqual(['voir <art> p.3', '<b>']);
  });

  it('lignes vides ignorées', () => {
    expect(items('\n [a](https://a.fr) \n\n')).toEqual(['<a>']);
    expect(items('')).toEqual([]);
  });
});

describe('joinSourceLines', () => {
  it('une ligne, séparateur « · » par défaut', () => {
    expect(joinSourceLines('Pièce 12\n  Pièce 14 \n\nArticle')).toBe('Pièce 12 · Pièce 14 · Article');
    expect(joinSourceLines('a\r\nb', '<br>')).toBe('a<br>b');
    expect(joinSourceLines('seule')).toBe('seule');
  });
});
