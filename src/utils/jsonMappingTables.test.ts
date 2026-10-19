import { diagramColumns, type DiagramTable } from './jsonDiagramLayout';
import { describe, it, expect } from 'vitest';
import { autoFieldMappings, collectFields, detectCrossReferences, findSharedIdHub, idKey, idValuesOf, nameStem, flattenRecord } from './jsonMapping';

const personnes = [
  { id: 1, nom: 'Dupont', societe_id: 1 },
  { id: 2, nom: 'Martin', societe_id: 2 },
  { id: 3, nom: 'Durand', societe_id: 1 },
];
const societes = [
  { id: 1, raison: 'ACME' },
  { id: 2, raison: 'Globex' },
];

describe('nameStem', () => {
  it('reduces table and field names to a comparable stem', () => {
    expect(nameStem('societes')).toBe('societe');
    expect(nameStem('societe_id')).toBe('societe');
    expect(nameStem('SocieteId')).toBe('societe');
    expect(nameStem('data.companies')).toBe('company');
    expect(nameStem('company')).toBe('company');
    expect(nameStem('société')).toBe('societe');
  });
});

describe('detectCrossReferences', () => {
  const fields = collectFields(personnes.map((r) => flattenRecord(r)));
  const own = idValuesOf(personnes, 'id');
  const others = [{ key: 'array:societes', name: 'societes', ids: idValuesOf(societes, 'id') }];

  it('points a field to the table its name and values match, even when ids collide with its own', () => {
    // societe_id values (1, 2) are also person ids: the name decides
    expect(detectCrossReferences(personnes, fields, 'id', own, others).get('societe_id')).toBe('array:societes');
  });

  it('leaves to its own table a field matching it as well, without a naming hint', () => {
    const recs = [{ id: 1, chef: 2 }, { id: 2, chef: 1 }];
    const f = collectFields(recs);
    expect(detectCrossReferences(recs, f, 'id', idValuesOf(recs, 'id'), [{ key: 'array:x', name: 'equipes', ids: new Set(['1', '2']) }]).size).toBe(0);
  });

  it('ignores fields whose values do not point anywhere', () => {
    expect(detectCrossReferences(personnes, fields, 'id', own, others).has('nom')).toBe(false);
  });
});

describe('autoFieldMappings', () => {
  it('maps a cross-table reference to its target table', () => {
    const recs = personnes.map((r) => flattenRecord(r));
    const fields = collectFields(recs);
    const { mapping, labelTemplate } = autoFieldMappings(recs, fields, [], new Map([['societe_id', 'array:societes']]));
    expect(mapping.societe_id).toMatchObject({ enabled: true, target: 'ref', refSource: 'array:societes' });
    expect(mapping.id.target).toBe('id');
    expect(labelTemplate).toBe('{nom}');
  });
});

describe('police-records shape (crpj_ tables, overlapping ids)', () => {
  const procedures = [
    { id: 1, UNA: 1, lieu: 'Nantes' },
    { id: 2, UNA: 2, lieu: 'Rennes' },
    { id: 3, UNA: 3, lieu: 'Brest' },
  ];
  const victimes = [
    { id: 1, nom: 'A', procedure_id: 3 },
    { id: 2, nom: 'B', id_procedure: 1 },
    { id: 3, nom: 'C', procedure_id: 2, IdProcedure: 2 },
  ];
  const tables = [
    { key: 'array:crpj_Procédure', name: 'crpj_Procédure', ids: idValuesOf(procedures, 'id') },
    { key: 'array:crpj_Victime', name: 'crpj_Victime', ids: idValuesOf(victimes, 'id') },
  ];

  it('matches a field to a table despite the common prefix and accents', () => {
    const recs = victimes.map((r) => flattenRecord(r));
    const refs = detectCrossReferences(recs, collectFields(recs), 'id', tables[1].ids, [tables[0]]);
    expect(refs.get('procedure_id')).toBe('array:crpj_Procédure');
    expect(refs.get('id_procedure')).toBe('array:crpj_Procédure');
    expect(refs.get('IdProcedure')).toBe('array:crpj_Procédure');
  });

  it('does not take a copy of the id (UNA) for a reference to its own table', () => {
    const recs = procedures.map((r) => flattenRecord(r));
    const { mapping } = autoFieldMappings(recs, collectFields(recs), []);
    expect(mapping.UNA.target).not.toBe('ref');
  });
});

describe('ids from a CSV converted to JSON', () => {
  it('normalises numeric ids written as text, floats or with leading zeros', () => {
    expect(idKey(12)).toBe('12');
    expect(idKey('12')).toBe('12');
    expect(idKey('12.0')).toBe('12');
    expect(idKey(12.0)).toBe('12');
    expect(idKey('012')).toBe('12');
    expect(idKey(' 12 ')).toBe('12');
    expect(idKey('P-12')).toBe('P-12');
    expect(idKey('2024/0153')).toBe('2024/0153');
  });

  it('detects a reference whose values are floats of integer ids', () => {
    const procedures = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const victimes = [
      { id: '1', procedure_id: '3.0' },
      { id: '2', procedure_id: '1.0' },
      { id: '3', procedure_id: '2.0' },
    ];
    const recs = victimes.map((r) => flattenRecord(r));
    const refs = detectCrossReferences(recs, collectFields(recs), 'id', idValuesOf(victimes, 'id'), [
      { key: 'array:crpj_Procédure', name: 'crpj_Procédure', ids: idValuesOf(procedures, 'id') },
    ]);
    expect(refs.get('procedure_id')).toBe('array:crpj_Procédure');
  });
});

describe('shared id: every table keyed by the procedure number (crpj export)', () => {
  const tables = [
    { key: 'array:crpj_Procédure', name: 'crpj_Procédure', ids: new Set(['P1', 'P2', 'P3']), unique: true },
    // several infractions per procedure: ids repeat
    { key: 'array:crpj_Infraction', name: 'crpj_Infraction', ids: new Set(['P1', 'P2']), unique: false },
    // one victim per procedure: ids unique, but all are procedures
    { key: 'array:crpj_Victime', name: 'crpj_Victime', ids: new Set(['P1', 'P3']), unique: true },
    { key: 'array:autre', name: 'autre', ids: new Set(['X9']), unique: true },
  ];

  it('elects as hub the table whose unique ids hold the others, and points the others at it', () => {
    const { hub, members } = findSharedIdHub(tables);
    expect(hub).toBe('array:crpj_Procédure');
    expect([...members].sort()).toEqual(['array:crpj_Infraction', 'array:crpj_Victime']);
  });

  it('finds no hub when ids are row numbers of their own tables', () => {
    const rows = [
      { key: 'a', name: 'a', ids: new Set(['1', '2', '3']), unique: true },
      { key: 'b', name: 'b', ids: new Set(['10', '11']), unique: true },
    ];
    expect(findSharedIdHub(rows).hub).toBeNull();
  });
});

describe('diagramColumns', () => {
  const tbl = (key: string, targets: string[]): DiagramTable => ({
    key, name: key, count: 1, refs: targets.map((target) => ({ field: `${target}_id`, target, matched: 1 })), candidates: [],
  });

  it('puts targets right of the tables pointing into them', () => {
    const cols = diagramColumns([
      tbl('declarations', ['sinistres', 'assures']),
      tbl('sinistres', ['assures']),
      tbl('assures', []),
      tbl('expertises', ['sinistres']),
      tbl('temoins', ['sinistres']),
    ]);
    expect(cols.map((c) => c.map((t) => t.key).sort())).toEqual([
      ['declarations', 'expertises', 'temoins'],
      ['sinistres'],
      ['assures'],
    ]);
  });

  it('survives self references and cycles', () => {
    const cols = diagramColumns([tbl('a', ['a', 'b']), tbl('b', ['a'])]);
    expect(cols.flat().map((t) => t.key).sort()).toEqual(['a', 'b']);
  });
});
