# Plan d'Import GEDCOM/GeneWeb

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ImportModal                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ .ged (5.5.1)│  │ .ged (7.0)  │  │    .gw      │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              GenealogyImportService                       │   │
│  │  ┌────────────────┐    ┌────────────────┐                │   │
│  │  │  GedcomParser  │    │ GeneWebParser  │                │   │
│  │  │ (read-gedcom)  │    │   (custom)     │                │   │
│  │  └───────┬────────┘    └───────┬────────┘                │   │
│  │          │                     │                          │   │
│  │          ▼                     ▼                          │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │           GenealogyIntermediateModel                │ │   │
│  │  │  - individuals: GenealogyPerson[]                   │ │   │
│  │  │  - families: GenealogyFamily[]                      │ │   │
│  │  │  - metadata: { source, version, date }              │ │   │
│  │  └───────────────────────┬─────────────────────────────┘ │   │
│  │                          │                                │   │
│  │                          ▼                                │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │              ZeroNeuroneConverter                   │ │   │
│  │  │  - createElements(individuals) → Element[]          │ │   │
│  │  │  - createLinks(families) → Link[]                   │ │   │
│  │  │  - layoutTree(elements) → positions                 │ │   │
│  │  └───────────────────────┬─────────────────────────────┘ │   │
│  └──────────────────────────┼────────────────────────────────┘   │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Click-to-place Preview                     ││
│  │            (existing import flow with bounding box)          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Modèle Intermédiaire

```typescript
// Types intermédiaires (parsing → conversion)

interface GenealogyPerson {
  id: string;                    // @I1@ ou généré
  firstName: string;
  lastName: string;
  sex: 'M' | 'F' | 'U';

  // Dates
  birthDate?: GenealogyDate;
  birthPlace?: GenealogyPlace;
  deathDate?: GenealogyDate;
  deathPlace?: GenealogyPlace;

  // Métadonnées
  occupation?: string;
  notes?: string;

  // Relations (références)
  familyAsChild?: string;        // @F1@ - famille où cette personne est enfant
  familiesAsSpouse: string[];    // @F2@ - familles où cette personne est conjoint
}

interface GenealogyFamily {
  id: string;                    // @F1@
  husbandId?: string;            // @I1@
  wifeId?: string;               // @I2@
  childIds: string[];            // [@I3@, @I4@]

  marriageDate?: GenealogyDate;
  marriagePlace?: GenealogyPlace;
  divorceDate?: GenealogyDate;
}

interface GenealogyDate {
  day?: number;
  month?: number;
  year?: number;
  modifier?: 'about' | 'before' | 'after' | 'between';
  endYear?: number;              // pour les périodes
  raw: string;                   // date originale
}

interface GenealogyPlace {
  name: string;
  lat?: number;
  lng?: number;
}
```

## Mapping vers ZeroNeurone

### Elements

| Source GEDCOM/GW | Element ZeroNeurone | Type | Notes |
|------------------|---------------------|------|-------|
| INDI | Element | - | Un élément par individu |
| NAME | `label` | string | "Prénom NOM" |
| NOTE | `notes` | string | Notes libres, commentaires |
| Source file | `source` | string | Nom du fichier importé |
| BIRT DATE | `date` | Date | Date de naissance |
| BIRT-DEAT | `dateRange` | DateRange | Période de vie (naissance → décès) |
| BIRT PLAC + MAP | `geo` | GeoCoordinates | Coordonnées lieu naissance |
| Events | `events` | ElementEvent[] | Naissance, décès, mariages, résidences |
| SEX | `properties[Sexe]` | choice | M/F/Inconnu |
| OCCU | `properties[Profession]` | text | Profession |
| BIRT PLAC | `properties[Lieu de naissance]` | text | Nom du lieu |
| DEAT PLAC | `properties[Lieu de décès]` | text | Nom du lieu |
| @I1@ | `properties[GEDCOM ID]` | text | ID original pour référence |

```typescript
// Conversion INDI → Element
function personToElement(
  person: GenealogyPerson,
  sourceFile: string
): Partial<Element> {
  // Construire les événements de vie
  const events: ElementEvent[] = [];

  if (person.birthDate) {
    events.push({
      id: generateId(),
      date: toDate(person.birthDate),
      label: 'Naissance',
      geo: person.birthPlace?.lat ? {
        lat: person.birthPlace.lat,
        lng: person.birthPlace.lng
      } : undefined,
      properties: person.birthPlace ? [
        { key: 'Lieu', value: person.birthPlace.name, type: 'text' }
      ] : [],
    });
  }

  if (person.deathDate) {
    events.push({
      id: generateId(),
      date: toDate(person.deathDate),
      label: 'Décès',
      geo: person.deathPlace?.lat ? {
        lat: person.deathPlace.lat,
        lng: person.deathPlace.lng
      } : undefined,
      properties: person.deathPlace ? [
        { key: 'Lieu', value: person.deathPlace.name, type: 'text' }
      ] : [],
    });
  }

  // Ajouter les résidences comme événements (GEDCOM 7.0)
  for (const residence of person.residences || []) {
    events.push({
      id: generateId(),
      date: toDate(residence.startDate),
      dateEnd: residence.endDate ? toDate(residence.endDate) : undefined,
      label: 'Résidence',
      geo: residence.place?.lat ? {
        lat: residence.place.lat,
        lng: residence.place.lng
      } : undefined,
      properties: [
        { key: 'Lieu', value: residence.place?.name || '', type: 'text' }
      ],
    });
  }

  return {
    id: generateId(),
    label: `${person.firstName} ${person.lastName}`,

    // Notes et source
    notes: person.notes || '',
    source: sourceFile,

    // Dates
    date: person.birthDate ? toDate(person.birthDate) : null,
    dateRange: (person.birthDate || person.deathDate) ? {
      start: person.birthDate ? toDate(person.birthDate) : null,
      end: person.deathDate ? toDate(person.deathDate) : null,
    } : null,

    // Géolocalisation (lieu de naissance par défaut)
    geo: person.birthPlace?.lat ? {
      lat: person.birthPlace.lat,
      lng: person.birthPlace.lng
    } : null,

    // Événements de vie
    events,

    // Propriétés typées
    properties: [
      { key: 'Prénom', value: person.firstName, type: 'text' },
      { key: 'Nom', value: person.lastName, type: 'text' },
      { key: 'Sexe', value: person.sex === 'M' ? 'Masculin' : person.sex === 'F' ? 'Féminin' : 'Inconnu', type: 'choice' },
      ...(person.occupation ? [{ key: 'Profession', value: person.occupation, type: 'text' as const }] : []),
      ...(person.birthPlace ? [{ key: 'Lieu de naissance', value: person.birthPlace.name, type: 'text' as const }] : []),
      ...(person.deathPlace ? [{ key: 'Lieu de décès', value: person.deathPlace.name, type: 'text' as const }] : []),
      { key: 'GEDCOM ID', value: person.id, type: 'text' },
    ],

    // Confiance par défaut (données importées)
    confidence: 80,

    // Visuel
    visual: {
      color: person.sex === 'M' ? '#93c5fd' : person.sex === 'F' ? '#f9a8d4' : '#d4d4d4',
      borderColor: person.sex === 'M' ? '#3b82f6' : person.sex === 'F' ? '#ec4899' : '#737373',
      borderWidth: 2,
      borderStyle: 'solid',
      shape: 'rectangle',
      size: 'medium',
      icon: person.sex === 'M' ? 'user' : person.sex === 'F' ? 'user' : 'user',
      image: null,
    },

    // Tags
    tags: ['Généalogie', person.sex === 'M' ? 'Homme' : person.sex === 'F' ? 'Femme' : 'Inconnu'],
  };
}
```

### Links

| Source GEDCOM/GW | Link ZeroNeurone | Type | Notes |
|------------------|------------------|------|-------|
| FAM (marriage) | Link | - | Lien entre époux |
| FAM (child) | Link | - | Lien parent → enfant |
| Relation label | `label` | string | "marié(e) à", "parent de", etc. |
| NOTE on FAM | `notes` | string | Notes sur la relation |
| Source file | `source` | string | Nom du fichier importé |
| MARR DATE | `date` | Date | Date du mariage |
| MARR-DIV | `dateRange` | DateRange | Période du mariage |
| MARR DATE | `properties[Date mariage]` | date | Date formatée |
| MARR PLAC | `properties[Lieu mariage]` | text | Lieu de la cérémonie |
| DIV DATE | `properties[Date divorce]` | date | Si divorcés |
| @F1@ | `properties[GEDCOM FAM ID]` | text | ID famille original |

| Relation | Direction | Couleur | Épaisseur |
|----------|-----------|---------|-----------|
| Parent → Enfant | `forward` | vert (#10b981) | 2 |
| Époux ↔ Épouse | `both` | orange (#f59e0b) | 3 |
| Frère/Sœur | `none` | bleu (#3b82f6) | 1, dashed |

```typescript
// Conversion FAM → Links
function familyToLinks(
  family: GenealogyFamily,
  idMapping: Map<string, string>,  // gedcomId → elementId
  sourceFile: string,
  options: { createSiblingLinks: boolean }
): Partial<Link>[] {
  const links: Partial<Link>[] = [];

  // Lien de mariage (époux ↔ épouse)
  if (family.husbandId && family.wifeId) {
    const husbandElementId = idMapping.get(family.husbandId);
    const wifeElementId = idMapping.get(family.wifeId);

    if (husbandElementId && wifeElementId) {
      links.push({
        id: generateId(),
        fromId: husbandElementId,
        toId: wifeElementId,
        label: 'marié(e) à',

        // Notes et source
        notes: family.notes || '',
        source: sourceFile,

        // Direction bidirectionnelle
        direction: 'both',
        directed: false,

        // Dates
        date: family.marriageDate ? toDate(family.marriageDate) : null,
        dateRange: (family.marriageDate || family.divorceDate) ? {
          start: family.marriageDate ? toDate(family.marriageDate) : null,
          end: family.divorceDate ? toDate(family.divorceDate) : null,
        } : null,

        // Propriétés typées
        properties: [
          ...(family.marriageDate ? [{ key: 'Date mariage', value: formatDate(family.marriageDate), type: 'date' as const }] : []),
          ...(family.marriagePlace ? [{ key: 'Lieu mariage', value: family.marriagePlace.name, type: 'text' as const }] : []),
          ...(family.divorceDate ? [{ key: 'Date divorce', value: formatDate(family.divorceDate), type: 'date' as const }] : []),
          { key: 'GEDCOM FAM ID', value: family.id, type: 'text' },
        ],

        // Confiance
        confidence: 80,

        // Tags
        tags: ['Mariage', 'Généalogie'],

        // Visuel - orange, épais, bidirectionnel
        visual: {
          color: '#f59e0b',
          style: 'solid',
          thickness: 3,
        },
      });
    }
  }

  // Liens parent → enfant
  const parentIds = [family.husbandId, family.wifeId].filter(Boolean);
  for (const parentId of parentIds) {
    const parentElementId = idMapping.get(parentId!);
    if (!parentElementId) continue;

    for (const childId of family.childIds) {
      const childElementId = idMapping.get(childId);
      if (!childElementId) continue;

      links.push({
        id: generateId(),
        fromId: parentElementId,
        toId: childElementId,
        label: 'parent de',

        // Notes et source
        notes: '',
        source: sourceFile,

        // Direction parent → enfant
        direction: 'forward',
        directed: true,

        // Propriétés
        properties: [
          { key: 'Type', value: 'Filiation', type: 'text' },
          { key: 'GEDCOM FAM ID', value: family.id, type: 'text' },
        ],

        // Confiance
        confidence: 90,

        // Tags
        tags: ['Filiation', 'Généalogie'],

        // Visuel - vert, normal
        visual: {
          color: '#10b981',
          style: 'solid',
          thickness: 2,
        },
      });
    }
  }

  // Liens fraternels (optionnel - peut générer beaucoup de liens)
  if (options.createSiblingLinks && family.childIds.length > 1) {
    for (let i = 0; i < family.childIds.length; i++) {
      for (let j = i + 1; j < family.childIds.length; j++) {
        const sibling1Id = idMapping.get(family.childIds[i]);
        const sibling2Id = idMapping.get(family.childIds[j]);

        if (sibling1Id && sibling2Id) {
          links.push({
            id: generateId(),
            fromId: sibling1Id,
            toId: sibling2Id,
            label: 'frère/sœur de',

            // Notes et source
            notes: '',
            source: sourceFile,

            // Direction non dirigée
            direction: 'none',
            directed: false,

            // Propriétés
            properties: [
              { key: 'Type', value: 'Fratrie', type: 'text' },
              { key: 'GEDCOM FAM ID', value: family.id, type: 'text' },
            ],

            // Confiance
            confidence: 90,

            // Tags
            tags: ['Fratrie', 'Généalogie'],

            // Visuel - bleu, léger, pointillé
            visual: {
              color: '#3b82f6',
              style: 'dashed',
              thickness: 1,
            },
          });
        }
      }
    }
  }

  return links;
}
```

### Layout Automatique

```typescript
// Positionnement en arbre généalogique
function layoutGenealogyTree(
  elements: Element[],
  links: Link[],
  options: {
    nodeWidth: number;      // 200
    nodeHeight: number;     // 80
    levelHeight: number;    // 150
    siblingGap: number;     // 50
    coupleGap: number;      // 30
  }
): Map<string, { x: number; y: number }> {
  // 1. Identifier les générations (BFS depuis les individus sans parents)
  // 2. Positionner par génération (Y = generation * levelHeight)
  // 3. Centrer les couples
  // 4. Répartir les enfants sous les parents
  // 5. Ajuster pour éviter les chevauchements
}
```

## Propriétés Importées

### Propriétés Standard (toujours importées)

| Clé | Source GEDCOM | Source GW | Type |
|-----|---------------|-----------|------|
| Prénom | NAME/GIVN | FirstName | text |
| Nom | NAME/SURN | LastName | text |
| Sexe | SEX | h/f dans beg | enum |
| Profession | OCCU | #occu | text |
| Lieu de naissance | BIRT/PLAC | #bp | text |
| Lieu de décès | DEAT/PLAC | #dp | text |

### Propriétés Optionnelles (GEDCOM 7.0)

| Clé | Source | Condition |
|-----|--------|-----------|
| Coordonnées naissance | BIRT/PLAC/MAP | Si LATI+LONG présents |
| Coordonnées décès | DEAT/PLAC/MAP | Si LATI+LONG présents |
| Résidence | RESI | Si présent |

### Métadonnées Import

Chaque élément importé reçoit :
- Tag `genealogy` + `imported`
- Property `source_id` = ID GEDCOM original (@I1@)
- Property `import_file` = nom du fichier source
- Property `import_date` = date d'import

## Options d'Import (UI)

```typescript
interface GenealogyImportOptions {
  // Layout
  autoLayout: boolean;           // Positionner automatiquement en arbre
  layoutDirection: 'TB' | 'BT';  // Top-Bottom ou Bottom-Top

  // Liens
  createSiblingLinks: boolean;   // Créer liens fraternels (peut être nombreux)

  // Couleurs
  colorByGender: boolean;        // Bleu/Rose par sexe

  // Données
  importNotes: boolean;          // Importer les notes comme description
  importOccupation: boolean;     // Importer la profession

  // Merge
  mergeExisting: boolean;        // Fusionner avec éléments existants (même nom+dates)
}
```

## Structure des Fichiers

```
src/
├── services/
│   ├── genealogy/
│   │   ├── index.ts                    # Export principal
│   │   ├── types.ts                    # Types intermédiaires
│   │   ├── gedcomParser.ts             # Parser GEDCOM (utilise read-gedcom)
│   │   ├── genewebParser.ts            # Parser GeneWeb custom
│   │   ├── genealogyConverter.ts       # Conversion → Elements/Links
│   │   ├── genealogyLayout.ts          # Layout arbre
│   │   └── genealogyImportService.ts   # Service orchestrateur
│   └── importService.ts                # Modifier pour supporter .ged/.gw
├── components/
│   └── modals/
│       └── ImportModal.tsx             # Ajouter options genealogy
```

## Étapes d'Implémentation

### Phase 1 : Parser GEDCOM
1. `npm install read-gedcom`
2. Créer `gedcomParser.ts` avec wrapper autour de read-gedcom
3. Mapper vers `GenealogyIntermediateModel`
4. Tester avec `exemple_arbre.ged` et `exemple_arbre_v7.ged`

### Phase 2 : Parser GeneWeb
1. Créer `genewebParser.ts` custom
2. Parser les blocs `fam`, `pevt`, `notes`
3. Mapper vers `GenealogyIntermediateModel`
4. Tester avec `exemple_arbre.gw`

### Phase 3 : Conversion ZeroNeurone
1. Créer `genealogyConverter.ts`
2. Implémenter `personToElement()` et `familyToLinks()`
3. Créer `genealogyLayout.ts` pour positionnement arbre

### Phase 4 : Intégration UI
1. Modifier `ImportModal` pour détecter .ged/.gw
2. Ajouter options spécifiques généalogie
3. Intégrer avec le flow click-to-place existant

## Dépendances

```json
{
  "dependencies": {
    "read-gedcom": "^0.3.2"
  }
}
```

## Risques et Mitigations

| Risque | Mitigation |
|--------|------------|
| Fichiers GEDCOM mal formés | read-gedcom est tolérant, + fallback graceful |
| Encodages variés | read-gedcom détecte auto (UTF-8, CP1252, etc.) |
| Gros fichiers (>1000 individus) | Parsing async + progress bar |
| Liens fraternels nombreux | Option désactivée par défaut |
| Coordonnées manquantes | Seulement GEDCOM 7.0 les supporte |
