# zeroneurone — Système de TagSets

## Destination : Claude Code

Ce document spécifie le système de gestion des tags avec propriétés suggérées.

---

## Concept

### Principe

Un **TagSet** est une définition de tag réutilisable avec des propriétés suggérées.

- Les TagSets sont **globaux** (partagés entre toutes les enquêtes)
- Les TagSets sont **optionnels** (l'utilisateur peut créer des tags libres sans TagSet)
- Les propriétés sont **suggérées** (jamais obligatoires, jamais imposées)

### Philosophie

> "Ontologie-free" — L'outil suggère, l'utilisateur décide.

Quand l'utilisateur ajoute le tag "Personne" à un élément :
1. Si un TagSet "Personne" existe → proposer les propriétés suggérées
2. L'utilisateur choisit lesquelles ajouter (ou aucune)
3. L'utilisateur peut ajouter d'autres propriétés libres
4. Si pas de TagSet → tag simple, rien de plus

### Cas d'usage

**Scenario 1 — Utilisation d'un TagSet**
1. Utilisateur crée un élément "Jean Dupont"
2. Ajoute le tag "Personne"
3. Le système détecte qu'un TagSet "Personne" existe
4. Propose : "Ajouter les propriétés suggérées ?" avec la liste
5. Utilisateur coche : Date de naissance, Téléphone
6. Les propriétés sont ajoutées (vides, à remplir)

**Scenario 2 — Tag libre**
1. Utilisateur ajoute le tag "VIP"
2. Pas de TagSet "VIP" → rien de plus
3. Tag ajouté simplement

**Scenario 3 — Ignorer les suggestions**
1. Utilisateur ajoute le tag "Entreprise"
2. TagSet existe, proposition affichée
3. Utilisateur clique "Ignorer" ou ferme
4. Tag ajouté sans propriétés

---

## Modèle de données

### TagSet

```typescript
interface TagSet {
  id: TagSetId;
  
  // Nom du tag (unique, insensible à la casse)
  name: string;
  
  // Description (optionnelle, pour l'utilisateur)
  description: string;
  
  // Apparence par défaut quand ce tag est appliqué
  defaultVisual: {
    color: string | null;      // Couleur suggérée
    shape: ElementShape | null; // Forme suggérée
    icon: string | null;        // Icône suggérée (nom Lucide)
  };
  
  // Propriétés suggérées
  suggestedProperties: SuggestedProperty[];
  
  // Métadonnées
  isBuiltIn: boolean;          // true = fourni par défaut, false = créé par l'utilisateur
  createdAt: Date;
  updatedAt: Date;
}

interface SuggestedProperty {
  key: string;                 // Nom de la propriété
  type: PropertyType;          // Type de valeur
  description: string;         // Aide pour l'utilisateur
  placeholder: string;         // Exemple de valeur
}

type PropertyType = 
  | 'text'       // Texte libre
  | 'number'     // Nombre
  | 'date'       // Date
  | 'datetime'   // Date et heure
  | 'boolean'    // Oui/Non
  | 'choice'     // Choix parmi une liste
  | 'geo';       // Coordonnées géographiques

// Pour le type 'choice'
interface SuggestedPropertyChoice extends SuggestedProperty {
  type: 'choice';
  choices: string[];           // Options disponibles
}

type TagSetId = string; // UUID
```

### Stockage

Les TagSets sont stockés dans IndexedDB, dans un store dédié **hors des enquêtes**.

```typescript
// Dans database.ts, ajouter le store

this.version(2).stores({
  // ... stores existants ...
  tagSets: 'id, name',
});
```

### Relation avec les éléments

Les éléments gardent leur structure actuelle. Les tags restent des strings simples.

```typescript
interface Element {
  // ... existant ...
  tags: string[];  // Toujours des strings simples
}
```

Le lien TagSet ↔ Element est fait par **correspondance de nom** (insensible à la casse).

---

## TagSets par défaut (built-in)

L'application est livrée avec ces TagSets pré-configurés. L'utilisateur peut les modifier ou les supprimer.

### Personne

```typescript
{
  name: 'Personne',
  description: 'Individu, suspect, témoin, victime...',
  defaultVisual: {
    color: '#3b82f6',  // Bleu
    shape: 'circle',
    icon: 'User',
  },
  suggestedProperties: [
    { key: 'Date de naissance', type: 'date', description: '', placeholder: '1985-03-15' },
    { key: 'Lieu de naissance', type: 'text', description: '', placeholder: 'Paris' },
    { key: 'Nationalité', type: 'text', description: '', placeholder: 'Française' },
    { key: 'Alias', type: 'text', description: 'Pseudos, surnoms', placeholder: 'Le Baron' },
    { key: 'Adresse', type: 'text', description: '', placeholder: '12 rue de la Paix, 75002 Paris' },
    { key: 'Téléphone', type: 'text', description: '', placeholder: '+33 6 12 34 56 78' },
    { key: 'Email', type: 'text', description: '', placeholder: 'jean.dupont@email.com' },
    { key: 'Profession', type: 'text', description: '', placeholder: 'Comptable' },
  ],
  isBuiltIn: true,
}
```

### Entreprise

```typescript
{
  name: 'Entreprise',
  description: 'Société, organisation, association...',
  defaultVisual: {
    color: '#8b5cf6',  // Violet
    shape: 'square',
    icon: 'Building2',
  },
  suggestedProperties: [
    { key: 'SIREN', type: 'text', description: '9 chiffres', placeholder: '823456789' },
    { key: 'SIRET', type: 'text', description: '14 chiffres', placeholder: '82345678900012' },
    { key: 'Forme juridique', type: 'text', description: '', placeholder: 'SARL' },
    { key: 'Date de création', type: 'date', description: '', placeholder: '2015-06-01' },
    { key: 'Capital social', type: 'number', description: 'En euros', placeholder: '10000' },
    { key: 'Adresse siège', type: 'text', description: '', placeholder: '1 avenue des Champs-Élysées, 75008 Paris' },
    { key: 'Secteur d\'activité', type: 'text', description: 'Code NAF ou description', placeholder: '6201Z - Programmation informatique' },
    { key: 'Statut', type: 'choice', description: '', placeholder: '', choices: ['Active', 'Radiée', 'En liquidation'] },
  ],
  isBuiltIn: true,
}
```

### Compte bancaire

```typescript
{
  name: 'Compte bancaire',
  description: 'Compte courant, épargne, professionnel...',
  defaultVisual: {
    color: '#059669',  // Vert
    shape: 'rectangle',
    icon: 'Landmark',
  },
  suggestedProperties: [
    { key: 'IBAN', type: 'text', description: '', placeholder: 'FR76 1234 5678 9012 3456 7890 123' },
    { key: 'BIC', type: 'text', description: '', placeholder: 'BNPAFRPP' },
    { key: 'Banque', type: 'text', description: '', placeholder: 'BNP Paribas' },
    { key: 'Titulaire', type: 'text', description: '', placeholder: 'Jean Dupont' },
    { key: 'Type', type: 'choice', description: '', placeholder: '', choices: ['Courant', 'Épargne', 'Professionnel', 'Joint'] },
  ],
  isBuiltIn: true,
}
```

### Véhicule

```typescript
{
  name: 'Véhicule',
  description: 'Voiture, moto, camion...',
  defaultVisual: {
    color: '#f59e0b',  // Orange
    shape: 'diamond',
    icon: 'Car',
  },
  suggestedProperties: [
    { key: 'Immatriculation', type: 'text', description: '', placeholder: 'AB-123-CD' },
    { key: 'Marque', type: 'text', description: '', placeholder: 'Renault' },
    { key: 'Modèle', type: 'text', description: '', placeholder: 'Clio' },
    { key: 'Couleur', type: 'text', description: '', placeholder: 'Gris' },
    { key: 'VIN', type: 'text', description: 'Numéro de série', placeholder: 'VF1AB123456789012' },
    { key: 'Date mise en circulation', type: 'date', description: '', placeholder: '2020-01-15' },
  ],
  isBuiltIn: true,
}
```

### Téléphone

```typescript
{
  name: 'Téléphone',
  description: 'Numéro de téléphone, ligne...',
  defaultVisual: {
    color: '#06b6d4',  // Cyan
    shape: 'circle',
    icon: 'Phone',
  },
  suggestedProperties: [
    { key: 'Numéro', type: 'text', description: 'Format international', placeholder: '+33 6 12 34 56 78' },
    { key: 'Opérateur', type: 'text', description: '', placeholder: 'Orange' },
    { key: 'Type', type: 'choice', description: '', placeholder: '', choices: ['Mobile', 'Fixe', 'VoIP'] },
    { key: 'IMEI', type: 'text', description: 'Si mobile', placeholder: '123456789012345' },
  ],
  isBuiltIn: true,
}
```

### Email

```typescript
{
  name: 'Email',
  description: 'Adresse email...',
  defaultVisual: {
    color: '#ec4899',  // Rose
    shape: 'circle',
    icon: 'Mail',
  },
  suggestedProperties: [
    { key: 'Adresse', type: 'text', description: '', placeholder: 'contact@example.com' },
    { key: 'Fournisseur', type: 'text', description: '', placeholder: 'Gmail' },
  ],
  isBuiltIn: true,
}
```

### Site web

```typescript
{
  name: 'Site web',
  description: 'Site internet, domaine...',
  defaultVisual: {
    color: '#6366f1',  // Indigo
    shape: 'square',
    icon: 'Globe',
  },
  suggestedProperties: [
    { key: 'URL', type: 'text', description: '', placeholder: 'https://example.com' },
    { key: 'Domaine', type: 'text', description: '', placeholder: 'example.com' },
    { key: 'Registrar', type: 'text', description: '', placeholder: 'OVH' },
    { key: 'Date création', type: 'date', description: '', placeholder: '2010-05-20' },
    { key: 'Date expiration', type: 'date', description: '', placeholder: '2025-05-20' },
    { key: 'IP', type: 'text', description: '', placeholder: '93.184.216.34' },
    { key: 'Hébergeur', type: 'text', description: '', placeholder: 'AWS' },
  ],
  isBuiltIn: true,
}
```

### Compte en ligne

```typescript
{
  name: 'Compte en ligne',
  description: 'Réseau social, plateforme...',
  defaultVisual: {
    color: '#14b8a6',  // Teal
    shape: 'circle',
    icon: 'AtSign',
  },
  suggestedProperties: [
    { key: 'Plateforme', type: 'choice', description: '', placeholder: '', choices: ['Twitter/X', 'Facebook', 'Instagram', 'LinkedIn', 'Telegram', 'TikTok', 'YouTube', 'Snapchat', 'Discord', 'Autre'] },
    { key: 'Username', type: 'text', description: '', placeholder: '@johndoe' },
    { key: 'URL profil', type: 'text', description: '', placeholder: 'https://twitter.com/johndoe' },
    { key: 'Nom affiché', type: 'text', description: '', placeholder: 'John Doe' },
    { key: 'Followers', type: 'number', description: '', placeholder: '1234' },
  ],
  isBuiltIn: true,
}
```

### Wallet crypto

```typescript
{
  name: 'Wallet crypto',
  description: 'Portefeuille de cryptomonnaie...',
  defaultVisual: {
    color: '#f97316',  // Orange vif
    shape: 'hexagon',
    icon: 'Wallet',
  },
  suggestedProperties: [
    { key: 'Adresse', type: 'text', description: '', placeholder: '0x1234...abcd' },
    { key: 'Blockchain', type: 'choice', description: '', placeholder: '', choices: ['Bitcoin', 'Ethereum', 'Tron', 'Solana', 'Polygon', 'BSC', 'Autre'] },
    { key: 'Type', type: 'choice', description: '', placeholder: '', choices: ['Personnel', 'Exchange', 'Smart contract', 'Mixer'] },
    { key: 'Plateforme', type: 'text', description: 'Si exchange', placeholder: 'Binance' },
  ],
  isBuiltIn: true,
}
```

### Document d'identité

```typescript
{
  name: 'Document d\'identité',
  description: 'Passeport, CNI, permis...',
  defaultVisual: {
    color: '#64748b',  // Gris
    shape: 'rectangle',
    icon: 'CreditCard',
  },
  suggestedProperties: [
    { key: 'Type', type: 'choice', description: '', placeholder: '', choices: ['Passeport', 'CNI', 'Permis de conduire', 'Titre de séjour', 'Autre'] },
    { key: 'Numéro', type: 'text', description: '', placeholder: '12AB34567' },
    { key: 'Pays émetteur', type: 'text', description: '', placeholder: 'France' },
    { key: 'Date émission', type: 'date', description: '', placeholder: '2020-01-15' },
    { key: 'Date expiration', type: 'date', description: '', placeholder: '2030-01-14' },
  ],
  isBuiltIn: true,
}
```

### Lieu

```typescript
{
  name: 'Lieu',
  description: 'Adresse, bâtiment, zone...',
  defaultVisual: {
    color: '#ef4444',  // Rouge
    shape: 'square',
    icon: 'MapPin',
  },
  suggestedProperties: [
    { key: 'Adresse', type: 'text', description: '', placeholder: '12 rue de la Paix' },
    { key: 'Code postal', type: 'text', description: '', placeholder: '75002' },
    { key: 'Ville', type: 'text', description: '', placeholder: 'Paris' },
    { key: 'Pays', type: 'text', description: '', placeholder: 'France' },
    { key: 'Type', type: 'choice', description: '', placeholder: '', choices: ['Domicile', 'Bureau', 'Commerce', 'Entrepôt', 'Parking', 'Autre'] },
  ],
  isBuiltIn: true,
}
```

### Transaction

```typescript
{
  name: 'Transaction',
  description: 'Mouvement financier, virement...',
  defaultVisual: {
    color: '#22c55e',  // Vert vif
    shape: 'diamond',
    icon: 'ArrowRightLeft',
  },
  suggestedProperties: [
    { key: 'Date', type: 'datetime', description: '', placeholder: '2024-03-15 14:30' },
    { key: 'Montant', type: 'number', description: '', placeholder: '1500' },
    { key: 'Devise', type: 'choice', description: '', placeholder: '', choices: ['EUR', 'USD', 'GBP', 'CHF', 'BTC', 'ETH', 'USDT', 'Autre'] },
    { key: 'Émetteur', type: 'text', description: '', placeholder: 'Compte A' },
    { key: 'Bénéficiaire', type: 'text', description: '', placeholder: 'Compte B' },
    { key: 'Référence', type: 'text', description: '', placeholder: 'VIR-2024-12345' },
    { key: 'Motif', type: 'text', description: '', placeholder: 'Prestation de service' },
  ],
  isBuiltIn: true,
}
```

### Événement

```typescript
{
  name: 'Événement',
  description: 'Fait, incident, rendez-vous...',
  defaultVisual: {
    color: '#a855f7',  // Violet clair
    shape: 'diamond',
    icon: 'Calendar',
  },
  suggestedProperties: [
    { key: 'Date/heure', type: 'datetime', description: '', placeholder: '2024-03-15 14:30' },
    { key: 'Lieu', type: 'text', description: '', placeholder: 'Paris' },
    { key: 'Type', type: 'text', description: '', placeholder: 'Réunion' },
    { key: 'Description', type: 'text', description: '', placeholder: 'Rencontre entre A et B' },
  ],
  isBuiltIn: true,
}
```

---

## TagSets complémentaires (se combinent avec d'autres)

Ces TagSets sont conçus pour être ajoutés **en plus** d'un tag de base (Personne, Entreprise...).

### Dirigeant

```typescript
{
  name: 'Dirigeant',
  description: 'Rôle de direction (à combiner avec Personne)',
  defaultVisual: {
    color: null,  // Pas de couleur, garde celle de Personne
    shape: null,
    icon: 'Crown',
  },
  suggestedProperties: [
    { key: 'Fonction', type: 'text', description: '', placeholder: 'PDG' },
    { key: 'Organisation', type: 'text', description: '', placeholder: 'Société ABC' },
    { key: 'Date de prise de fonction', type: 'date', description: '', placeholder: '2020-01-15' },
    { key: 'Date de fin de fonction', type: 'date', description: '', placeholder: '' },
  ],
  isBuiltIn: true,
}
```

### Militaire

```typescript
{
  name: 'Militaire',
  description: 'Personnel militaire (à combiner avec Personne)',
  defaultVisual: {
    color: null,
    shape: null,
    icon: 'Shield',
  },
  suggestedProperties: [
    { key: 'Grade', type: 'text', description: '', placeholder: 'Colonel' },
    { key: 'Arme', type: 'choice', description: '', placeholder: '', choices: ['Armée de Terre', 'Marine Nationale', 'Armée de l\'Air', 'Gendarmerie', 'Autre'] },
    { key: 'Unité', type: 'text', description: '', placeholder: '1er Régiment de Hussards Parachutistes' },
    { key: 'Matricule', type: 'text', description: '', placeholder: '' },
    { key: 'Date d\'incorporation', type: 'date', description: '', placeholder: '2005-09-01' },
  ],
  isBuiltIn: true,
}
```

### Fonctionnaire

```typescript
{
  name: 'Fonctionnaire',
  description: 'Agent public (à combiner avec Personne)',
  defaultVisual: {
    color: null,
    shape: null,
    icon: 'Briefcase',
  },
  suggestedProperties: [
    { key: 'Administration', type: 'text', description: '', placeholder: 'Ministère de l\'Intérieur' },
    { key: 'Corps', type: 'text', description: '', placeholder: 'Attaché d\'administration' },
    { key: 'Grade', type: 'text', description: '', placeholder: 'Attaché principal' },
    { key: 'Affectation', type: 'text', description: '', placeholder: 'Préfecture du Rhône' },
  ],
  isBuiltIn: true,
}
```

### Élu

```typescript
{
  name: 'Élu',
  description: 'Mandat électif (à combiner avec Personne)',
  defaultVisual: {
    color: null,
    shape: null,
    icon: 'Vote',
  },
  suggestedProperties: [
    { key: 'Mandat', type: 'text', description: '', placeholder: 'Député' },
    { key: 'Circonscription', type: 'text', description: '', placeholder: '3e circonscription du Rhône' },
    { key: 'Parti', type: 'text', description: '', placeholder: '' },
    { key: 'Date d\'élection', type: 'date', description: '', placeholder: '2022-06-19' },
    { key: 'Fin de mandat', type: 'date', description: '', placeholder: '2027-06-30' },
  ],
  isBuiltIn: true,
}
```

### Avocat

```typescript
{
  name: 'Avocat',
  description: 'Profession juridique (à combiner avec Personne)',
  defaultVisual: {
    color: null,
    shape: null,
    icon: 'Scale',
  },
  suggestedProperties: [
    { key: 'Barreau', type: 'text', description: '', placeholder: 'Paris' },
    { key: 'Spécialité', type: 'text', description: '', placeholder: 'Droit des affaires' },
    { key: 'Cabinet', type: 'text', description: '', placeholder: 'Cabinet Dupont & Associés' },
    { key: 'Date d\'inscription', type: 'date', description: '', placeholder: '2010-01-01' },
  ],
  isBuiltIn: true,
}
```

### PEP (Personne Politiquement Exposée)

```typescript
{
  name: 'PEP',
  description: 'Personne politiquement exposée (à combiner avec Personne)',
  defaultVisual: {
    color: '#dc2626',  // Rouge — attention particulière
    shape: null,
    icon: 'AlertTriangle',
  },
  suggestedProperties: [
    { key: 'Type PEP', type: 'choice', description: '', placeholder: '', choices: ['National', 'Étranger', 'Organisation internationale', 'Proche'] },
    { key: 'Fonction exposante', type: 'text', description: '', placeholder: 'Ministre' },
    { key: 'Pays', type: 'text', description: '', placeholder: 'France' },
    { key: 'Source', type: 'text', description: 'Base de données, liste...', placeholder: 'World-Check' },
  ],
  isBuiltIn: true,
}
```

### Sanctionné

```typescript
{
  name: 'Sanctionné',
  description: 'Personne ou entité sous sanctions',
  defaultVisual: {
    color: '#dc2626',  // Rouge
    shape: null,
    icon: 'Ban',
  },
  suggestedProperties: [
    { key: 'Liste', type: 'choice', description: '', placeholder: '', choices: ['UE', 'OFAC (US)', 'ONU', 'UK', 'Autre'] },
    { key: 'Motif', type: 'text', description: '', placeholder: 'Financement du terrorisme' },
    { key: 'Date d\'inscription', type: 'date', description: '', placeholder: '2022-03-01' },
    { key: 'Référence', type: 'text', description: '', placeholder: '' },
  ],
  isBuiltIn: true,
}
```

### Suspect

```typescript
{
  name: 'Suspect',
  description: 'Statut dans l\'enquête',
  defaultVisual: {
    color: '#f97316',  // Orange
    shape: null,
    icon: 'AlertCircle',
  },
  suggestedProperties: [
    { key: 'Infractions supposées', type: 'text', description: '', placeholder: 'Blanchiment, abus de biens sociaux' },
    { key: 'Niveau de suspicion', type: 'choice', description: '', placeholder: '', choices: ['Faible', 'Moyen', 'Fort'] },
  ],
  isBuiltIn: true,
}
```

### Témoin

```typescript
{
  name: 'Témoin',
  description: 'Statut dans l\'enquête',
  defaultVisual: {
    color: '#06b6d4',  // Cyan
    shape: null,
    icon: 'Eye',
  },
  suggestedProperties: [
    { key: 'Type', type: 'choice', description: '', placeholder: '', choices: ['Direct', 'Indirect', 'Expert'] },
    { key: 'Fiabilité', type: 'choice', description: '', placeholder: '', choices: ['À vérifier', 'Fiable', 'Peu fiable'] },
  ],
  isBuiltIn: true,
}
```

### Victime

```typescript
{
  name: 'Victime',
  description: 'Statut dans l\'enquête',
  defaultVisual: {
    color: '#8b5cf6',  // Violet
    shape: null,
    icon: 'Heart',
  },
  suggestedProperties: [
    { key: 'Préjudice', type: 'text', description: '', placeholder: 'Escroquerie - 50 000 €' },
    { key: 'Date des faits', type: 'date', description: '', placeholder: '2023-06-15' },
    { key: 'Plainte déposée', type: 'boolean', description: '', placeholder: '' },
  ],
  isBuiltIn: true,
}
```

### Filiale

```typescript
{
  name: 'Filiale',
  description: 'Relation capitalistique (à combiner avec Entreprise)',
  defaultVisual: {
    color: null,
    shape: null,
    icon: 'GitBranch',
  },
  suggestedProperties: [
    { key: 'Société mère', type: 'text', description: '', placeholder: 'Holding ABC' },
    { key: 'Pourcentage détenu', type: 'number', description: '', placeholder: '100' },
    { key: 'Date d\'acquisition', type: 'date', description: '', placeholder: '2018-01-01' },
  ],
  isBuiltIn: true,
}
```

### Offshore

```typescript
{
  name: 'Offshore',
  description: 'Entité dans un paradis fiscal',
  defaultVisual: {
    color: '#f59e0b',  // Orange
    shape: null,
    icon: 'Palmtree',
  },
  suggestedProperties: [
    { key: 'Juridiction', type: 'choice', description: '', placeholder: '', choices: ['Îles Vierges Britanniques', 'Panama', 'Îles Caïmans', 'Luxembourg', 'Delaware', 'Autre'] },
    { key: 'Agent enregistré', type: 'text', description: '', placeholder: 'Mossack Fonseca' },
    { key: 'Bénéficiaire effectif', type: 'text', description: '', placeholder: '' },
  ],
  isBuiltIn: true,
}
```

---

## Exemple de combinaison

Un élément "Colonel Jean Dupont" peut avoir :

| Tag | Propriétés suggérées |
|-----|----------------------|
| Personne | Date de naissance, Téléphone, Email... |
| Militaire | Grade: Colonel, Arme: Armée de Terre, Unité... |
| PEP | Type: National, Fonction: Conseiller défense... |

Un élément "ABC Holdings Ltd" peut avoir :

| Tag | Propriétés suggérées |
|-----|----------------------|
| Entreprise | SIREN, Forme juridique, Date de création... |
| Offshore | Juridiction: Îles Vierges, Agent enregistré... |
| Sanctionné | Liste: UE, Motif, Date d'inscription... |

L'utilisateur compose librement. Aucune contrainte.

---

## Interface utilisateur

### Ajout d'un tag avec TagSet

**Flux :**

1. Utilisateur tape un tag dans l'éditeur de tags
2. Autocomplétion propose les TagSets existants + tags déjà utilisés
3. Si l'utilisateur choisit un TagSet :
   - Tag ajouté
   - Apparence par défaut appliquée (si définie)
   - Popup discret : "Ajouter les propriétés suggérées ?"
     - Liste des propriétés avec checkboxes (toutes cochées par défaut)
     - Bouton "Ajouter" / "Ignorer"
4. Si l'utilisateur tape un tag libre :
   - Tag ajouté simplement

**Wireframe — Popup propriétés suggérées :**

```
┌─────────────────────────────────────────┐
│ Propriétés suggérées pour "Personne"    │
├─────────────────────────────────────────┤
│                                         │
│ ☑ Date de naissance                     │
│ ☑ Lieu de naissance                     │
│ ☑ Nationalité                           │
│ ☑ Alias                                 │
│ ☑ Adresse                               │
│ ☑ Téléphone                             │
│ ☑ Email                                 │
│ ☑ Profession                            │
│                                         │
│ ☐ Tout sélectionner                     │
│                                         │
├─────────────────────────────────────────┤
│                    [Ignorer]  [Ajouter] │
└─────────────────────────────────────────┘
```

**Règles UI :**
- Popup non-bloquant (peut être ignoré en cliquant ailleurs)
- Apparaît près du champ tags
- Disparaît après action ou 10s d'inactivité
- Pas de popup si l'élément a déjà les propriétés

### Gestion des TagSets

**Accès :** Menu principal → "Gérer les tags" (ou icône engrenage dans l'éditeur de tags)

**Wireframe — Liste des TagSets :**

```
┌─────────────────────────────────────────────────────────────────┐
│ Gestion des tags                                          [✕]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ● Personne                                    [Modifier] │ │
│ │   8 propriétés • Défaut                                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ■ Entreprise                                  [Modifier] │ │
│ │   8 propriétés • Défaut                                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ◆ Transaction                                 [Modifier] │ │
│ │   7 propriétés • Personnalisé                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [+ Nouveau tag]                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ [Réinitialiser les tags par défaut]                             │
└─────────────────────────────────────────────────────────────────┘
```

**Wireframe — Édition d'un TagSet :**

```
┌─────────────────────────────────────────────────────────────────┐
│ Modifier "Personne"                                       [✕]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Nom                                                             │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Personne                                                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Description                                                     │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Individu, suspect, témoin, victime...                       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Apparence par défaut                                            │
│ ┌──────────┬──────────┬──────────┐                             │
│ │ ● Bleu   │ ○ Cercle │ 👤 User  │                             │
│ └──────────┴──────────┴──────────┘                             │
│                                                                 │
│ Propriétés suggérées                                            │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Date de naissance          [date]              [↑][↓][✕] │ │
│ │ Lieu de naissance          [texte]             [↑][↓][✕] │ │
│ │ Nationalité                [texte]             [↑][↓][✕] │ │
│ │ Alias                      [texte]             [↑][↓][✕] │ │
│ │ Adresse                    [texte]             [↑][↓][✕] │ │
│ │ Téléphone                  [texte]             [↑][↓][✕] │ │
│ │ Email                      [texte]             [↑][↓][✕] │ │
│ │ Profession                 [texte]             [↑][↓][✕] │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ [+ Ajouter une propriété]                                       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ [Supprimer ce tag]               [Annuler]  [Enregistrer]      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implémentation

### Repository TagSet

```typescript
// db/repositories/tagSetRepository.ts

class TagSetRepository {
  async getAll(): Promise<TagSet[]> {
    return db.tagSets.toArray();
  }

  async getByName(name: string): Promise<TagSet | undefined> {
    const normalized = name.toLowerCase().trim();
    return db.tagSets.where('name').equalsIgnoreCase(normalized).first();
  }

  async create(tagSet: Omit<TagSet, 'id' | 'createdAt' | 'updatedAt'>): Promise<TagSet> {
    const newTagSet: TagSet = {
      ...tagSet,
      id: generateUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.tagSets.add(newTagSet);
    return newTagSet;
  }

  async update(id: TagSetId, changes: Partial<TagSet>): Promise<void> {
    await db.tagSets.update(id, {
      ...changes,
      updatedAt: new Date(),
    });
  }

  async delete(id: TagSetId): Promise<void> {
    await db.tagSets.delete(id);
  }

  async resetToDefaults(): Promise<void> {
    await db.tagSets.clear();
    await db.tagSets.bulkAdd(DEFAULT_TAG_SETS);
  }
}
```

### Store TagSet

```typescript
// stores/tagSetStore.ts

interface TagSetState {
  tagSets: Map<TagSetId, TagSet>;
  isLoaded: boolean;
  
  // Actions
  load: () => Promise<void>;
  getByName: (name: string) => TagSet | undefined;
  create: (tagSet: Omit<TagSet, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TagSet>;
  update: (id: TagSetId, changes: Partial<TagSet>) => Promise<void>;
  delete: (id: TagSetId) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

export const useTagSetStore = create<TagSetState>((set, get) => ({
  tagSets: new Map(),
  isLoaded: false,

  load: async () => {
    const tagSets = await tagSetRepository.getAll();
    
    // Si vide, initialiser avec les défauts
    if (tagSets.length === 0) {
      await tagSetRepository.resetToDefaults();
      const defaults = await tagSetRepository.getAll();
      set({ tagSets: new Map(defaults.map(t => [t.id, t])), isLoaded: true });
    } else {
      set({ tagSets: new Map(tagSets.map(t => [t.id, t])), isLoaded: true });
    }
  },

  getByName: (name) => {
    const normalized = name.toLowerCase().trim();
    return Array.from(get().tagSets.values()).find(
      t => t.name.toLowerCase() === normalized
    );
  },

  // ... autres actions
}));
```

### Hook pour les propriétés suggérées

```typescript
// hooks/useSuggestedProperties.ts

interface UseSuggestedPropertiesResult {
  tagSet: TagSet | null;
  suggestedProperties: SuggestedProperty[];
  applyProperties: (propertyKeys: string[]) => void;
}

function useSuggestedProperties(
  elementId: ElementId,
  tagName: string
): UseSuggestedPropertiesResult {
  const { getByName } = useTagSetStore();
  const { updateElement, getElementById } = useInvestigationStore();

  const tagSet = getByName(tagName);
  const element = getElementById(elementId);

  const suggestedProperties = useMemo(() => {
    if (!tagSet || !element) return [];
    
    // Exclure les propriétés déjà présentes
    const existingKeys = new Set(element.properties.map(p => p.key.toLowerCase()));
    return tagSet.suggestedProperties.filter(
      p => !existingKeys.has(p.key.toLowerCase())
    );
  }, [tagSet, element]);

  const applyProperties = useCallback((propertyKeys: string[]) => {
    if (!element || !tagSet) return;

    const newProperties = tagSet.suggestedProperties
      .filter(p => propertyKeys.includes(p.key))
      .map(p => ({ key: p.key, value: null }));

    updateElement(elementId, {
      properties: [...element.properties, ...newProperties],
    });
  }, [element, tagSet, elementId, updateElement]);

  return { tagSet, suggestedProperties, applyProperties };
}
```

### Initialisation au premier lancement

```typescript
// Dans App.tsx ou un hook d'init

useEffect(() => {
  const init = async () => {
    const { load, tagSets } = useTagSetStore.getState();
    await load();
  };
  init();
}, []);
```

---

## Comportements détaillés

### Ajout de tag

| Action | Comportement |
|--------|--------------|
| Tape "Personne" (TagSet existe) | Autocomplétion suggère "Personne", tag ajouté, popup propriétés |
| Tape "personne" (casse différente) | Même chose, correspondance insensible à la casse |
| Tape "VIP" (pas de TagSet) | Tag ajouté simplement, pas de popup |
| Ajoute "Personne" sur élément qui a déjà les propriétés | Pas de popup |

### Apparence par défaut

| Action | Comportement |
|--------|--------------|
| Ajoute tag avec TagSet ayant defaultVisual | Propose d'appliquer l'apparence |
| Élément a déjà une couleur personnalisée | Ne pas écraser |
| TagSet sans defaultVisual | Rien de spécial |

### Gestion des TagSets

| Action | Comportement |
|--------|--------------|
| Supprimer un TagSet | Les tags existants sur les éléments restent (deviennent des tags simples) |
| Renommer un TagSet | Les tags existants ne sont PAS renommés (pas de cascade) |
| Modifier les propriétés | N'affecte pas les éléments existants |
| Réinitialiser | Supprime tous les TagSets custom, restaure les defaults |

---

## Checklist d'implémentation

### Phase 1 — Fondations
- [ ] Ajouter le type TagSet et SuggestedProperty
- [ ] Ajouter le store Dexie `tagSets`
- [ ] Créer le repository TagSetRepository
- [ ] Créer le store Zustand useTagSetStore
- [ ] Implémenter l'initialisation avec les defaults

### Phase 2 — UI TagSet
- [ ] Modal de gestion des TagSets
- [ ] Formulaire création/édition de TagSet
- [ ] Liste des TagSets avec actions (modifier, supprimer)
- [ ] Bouton réinitialiser

### Phase 3 — Intégration tags
- [ ] Autocomplétion des tags avec TagSets
- [ ] Popup propriétés suggérées lors de l'ajout
- [ ] Application de l'apparence par défaut (optionnel)
- [ ] Hook useSuggestedProperties

### Phase 4 — Polish
- [ ] Indicateur visuel sur les tags qui ont un TagSet
- [ ] Raccourci pour accéder à la gestion des tags
- [ ] Export/import des TagSets personnalisés

---

*Système de TagSets — zeroneurone — V1 — Janvier 2025*
