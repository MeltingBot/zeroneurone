# Décision : architecture de l'annulation (undo/redo)

**Statut** : spike terminé, migration non engagée
**Vérifié par** : `src/stores/undoManager.spike.test.ts` (6 tests, Yjs 13.6)

## Problème

`historyStore` est une pile de commandes maison (475 lignes, 20 types d'actions).
Elle est **purement locale** : elle enregistre des opérations et les rejoue dans
le Y.Doc partagé sans savoir lesquelles nous appartiennent.

En session partagée, un Ctrl+Z local peut donc écraser l'édition qu'un pair
vient de faire sur le même élément. Aucun mécanisme n'existe aujourd'hui pour
distinguer les changements locaux des changements distants dans la pile.

## Ce que le spike a établi

`Y.UndoManager` résout ce cas par les **origines de transaction**. Les six
hypothèses dont dépend la décision ont été vérifiées contre le Yjs installé,
pas contre la documentation :

| Hypothèse | Résultat |
|---|---|
| Les éditions locales sont suivies (`ydoc.transact(fn)` sans origine) | oui |
| Une édition distante (origine étrangère) survit à un undo local | oui |
| Le rechargement depuis IndexedDB n'entre pas dans l'historique | oui |
| Un `applyUpdate` imbriqué hérite de l'origine englobante | oui |
| Les éditions rapprochées fusionnent en une seule étape (500 ms) | oui |
| Le suivi peut être restreint à certaines racines du document | oui |

Deux points méritaient la vérification :

- **Le code applicatif ne passe jamais d'origine** : les 21 `ydoc.transact()`
  de `dossierStore` utilisent l'origine par défaut (`null`), qui est
  précisément celle que `Y.UndoManager` suit par défaut. Aucun changement de
  ces appels n'est nécessaire.
- **Le rejeu de la persistance chiffrée porte une origine** :
  `encryptedIndexeddbPersistence` enveloppe ses `applyUpdate` dans
  `Y.transact(doc, fn, persistence, false)`. Sans ce troisième argument, le
  premier Ctrl+Z après ouverture d'une enquête effacerait tout ce qui vient
  d'être chargé. La garantie tient parce que l'`applyUpdate` imbriqué hérite
  de l'origine — ce qui a été vérifié explicitement.

## Périmètre couvert

18 des 20 types d'actions portent sur de l'état Yjs (`elements`, `links`,
`tabs`, `reports`, `assets`) et seraient donc pris en charge automatiquement,
quel que soit l'appelant.

Deux types portent sur de l'état hors Yjs et resteraient à la pile maison :

- `delete-view` — les vues sont dans Dexie (`db.views`). Le Y.Doc expose bien
  une map `views`, mais `viewStore` ne l'utilise pas.
- `clear-filters` — filtres et éléments masqués sont dans l'état local de
  `viewStore`.

## Décision

Architecture cible : **`Y.UndoManager` pour l'état Yjs, pile maison réduite
pour le reste**.

Conséquence directe sur la feuille de route : la migration des 81 sites
`pushAction` des composants vers les stores, prévue au lot R1-2, **ne doit pas
être engagée**. `Y.UndoManager` capture les mutations Yjs automatiquement,
indépendamment de l'appelant : instrumenter les stores pour les 18 types
concernés serait du travail jeté.

## Points ouverts avant migration

1. **Granularité.** `captureTimeout` vaut 500 ms par défaut : deux actions
   utilisateur rapprochées fusionnent en une seule étape d'annulation. Il faudra
   soit appeler `stopCapturing()` entre deux actions distinctes, soit passer
   `captureTimeout: 0` et gérer le regroupement explicitement (notamment pour
   les imports, qui doivent former une seule entrée).
2. **Racines suivies.** Les `assets` sont diffusés par morceaux entre pairs ;
   les exclure du suivi évite qu'un undo d'élément ne défasse un transfert.
3. **Interaction avec les deux piles.** Ctrl+Z doit consulter une seule
   séquence ordonnée. Faire cohabiter `UndoManager` et la pile maison demande un
   ordonnancement explicite, sinon l'ordre d'annulation devient imprévisible
   dès qu'on mélange une suppression de vue et une suppression d'élément.
4. **Effets hors Y.Doc.** Certaines annulations ont des conséquences dans Dexie
   ou OPFS (assets, appartenance aux onglets) que `UndoManager` ne rejouera pas.
   Elles devront être rattachées aux événements `stack-item-popped`.
