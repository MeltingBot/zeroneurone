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

## Le prérequis : une action utilisateur = une transaction Y.Doc

`Y.UndoManager` raisonne en transactions : une transaction est une étape
d'annulation. Ce n'est pas le cas aujourd'hui.

Mesuré par `src/stores/transactionAtomicity.test.ts` :

| Action | Transactions |
|---|---|
| Créer un élément, un lien ; modifier ; déplacer ; supprimer un lien | 1 |
| **Supprimer un élément** | **3** |
| **Supprimer plusieurs éléments** | **4** |
| **Fusionner deux éléments** | **3** |

Les trois cas non atomiques sont exactement ceux qui suppriment un élément et
cascadent vers les onglets. La cascade est planifiée après un `import()`
dynamique, dans une transaction détachée : le nombre d'étapes d'annulation et
leur regroupement dépendent donc de la vitesse de résolution de cet import,
pas de l'intention. Non déterministe, donc intestable.

À noter : ces trois cas ne sont non atomiques **que si l'élément appartient à
un onglet**. Une mesure qui ne place pas les éléments dans un onglet conclut à
tort que tout est atomique — les tests le font explicitement.

Rendre ces mutations atomiques est un correctif utile indépendamment de
l'annulation : aujourd'hui un pair reçoit ces transactions séparément et
observe un état intermédiaire incohérent.

## Les autres points, une fois l'atomicité acquise

1. **Granularité** : `captureTimeout: 0`, une transaction = une étape. Les
   imports forment une seule entrée en enveloppant l'import dans une
   transaction unique.
2. **Racines suivies** : `elements`, `links`, `tabs`, `reports`, `meta` — pas
   `assets`, diffusés par morceaux entre pairs, qu'un undo d'élément ne doit
   pas défaire.
3. **Cohabitation des deux piles** : la supprimer plutôt que l'organiser. Les
   deux seuls cas hors Yjs (`delete-view`, `clear-filters`) sont des
   opérations de panneau, pas de document ; un Ctrl+Z sur le canvas n'a pas à
   les couvrir. Une affordance locale (toast « Annuler ») les traite mieux et
   élimine tout problème d'ordonnancement.
4. **Effets hors Y.Doc** : largement dissous. L'appartenance aux onglets
   redevient automatique dès que `tabs` est une racine suivie. Dexie devrait
   se remettre à jour via l'observer `_syncFromYDoc` existant — **à confirmer**,
   car cet observer s'appuie sur le drapeau `localOpPending`. Reste OPFS, où
   `cleanOrphanedOpfs()` couvre déjà les binaires orphelins.

## Ordre d'exécution

1. Rendre atomiques les trois mutations mesurées (sans toucher à l'annulation).
2. Brancher `UndoManager` en parallèle, sans le câbler à Ctrl+Z, et comparer.
3. Basculer Ctrl+Z, retirer les 18 cas du switch maison.
4. Traiter `delete-view` et `clear-filters` par des affordances locales.
