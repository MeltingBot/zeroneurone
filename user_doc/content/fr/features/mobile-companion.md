---
title: "Compagnon mobile"
weight: 9
---

# Compagnon mobile

Ouvrez un dossier partagé sur un téléphone, depuis le navigateur, sans installation : capturer sur le terrain (photo, note, position), consulter les éléments, la carte et la chronologie, modifier notes et propriétés, commenter.

Le compagnon passe par la [collaboration]({{< relref "collaboration" >}}) : le dossier doit être partagé **en mode asynchrone**.

---

## Ouvrir un dossier sur le téléphone

1. Sur le poste, partagez le dossier en cochant **Collaboration asynchrone**
2. Dans la fenêtre de partage, cliquez **Ouvrir sur mobile** : un QR code s'affiche
3. Scannez-le avec l'appareil photo du téléphone
4. Indiquez votre nom (il apparaît aux autres participants), puis **Ouvrir sur ce téléphone**

Le dossier est ensuite listé à l'adresse `/m/` : plus besoin du QR code pour le rouvrir.

Sur cette page, vous pouvez aussi **coller le lien de partage** (le lien desktop `/join/…` convient) ou le **scanner** avec le lecteur intégré (Chrome sur Android).

{{< hint warning >}}
**Le QR code donne accès au dossier.** Il contient la clé de chiffrement, comme le lien de partage : ne l'affichez pas devant des tiers et ne le photographiez pas ailleurs que sur le téléphone concerné. Arrêter le partage invalide tous les liens et QR codes.
{{< /hint >}}

### Pourquoi le mode asynchrone

Le serveur relais ne conserve pas le dossier : il transmet les modifications entre participants connectés. En mode asynchrone, il garde aussi les modifications **48 heures** (réglage par défaut du relais) pour qui se connecte plus tard. Sans ce mode, une capture faite pendant que le poste est éteint ne lui parviendrait que lorsque les deux sont en ligne en même temps.

À la première ouverture sur le téléphone, un poste ayant le dossier ouvert doit être en ligne : c'est lui qui envoie le contenu.

---

## Capturer

Onglet **Capturer** :

| Champ | Usage |
|-------|-------|
| **Titre** | Libellé de l'élément créé (à défaut : « Capture du » + date et heure) |
| **Source** | Source de l'information |
| **Note** | Texte libre, recherché comme les notes du poste |
| **Prendre une photo** | Ouvre l'appareil photo ; la photo devient une pièce jointe de l'élément |
| **Ajouter ma position** | Position GPS du téléphone (autorisation demandée par le navigateur) ; l'élément apparaît sur la carte |

L'élément reçoit la **date de collecte** (l'instant de la capture). Il arrive sur le poste **sous les éléments existants**, aligné à gauche : les captures successives forment une colonne. Si un onglet est affiché, il y est rangé. Aucune étiquette n'est ajoutée automatiquement.

Les photos sont réduites à 2048 pixels de côté avant l'envoi : elles restent dans la copie du dossier de chaque participant.

### Hors réseau

Sans réseau, la capture est enregistrée sur le téléphone et l'en-tête affiche **N en attente**. Elle part à la reconnexion ; le compteur revient alors à zéro. **Gardez la page ouverte jusqu'à ce que le compteur soit à zéro.**

---

## Consulter

| Onglet | Contenu |
|--------|---------|
| **Éléments** | Liste, du plus récent au plus ancien, et recherche |
| **Carte** | Éléments localisés, regroupés quand ils sont proches, et liens entre eux ; toucher un lien affiche ses extrémités ; bouton de position ; fond satellite |
| **Chronologie** | Périodes et événements des éléments, liens datés, groupés par jour (la date de collecte n'y figure pas, comme sur le poste) |
| **Commentaires** | Commentaires ouverts du dossier (résolus sur demande) |

### Onglets et étiquettes

Sous la recherche, les onglets du canvas : en toucher un n'affiche que ses éléments (liste, carte, chronologie, recherche). Le bouton de réglage à droite crée, renomme et supprime les onglets ; la suppression laisse les éléments dans le dossier.

Toucher une étiquette dans une fiche filtre sur cette étiquette ; taper `#` dans la recherche propose les étiquettes du dossier. Plusieurs étiquettes se cumulent ; la croix en retire une.

### Recherche

La barre de recherche reste en haut de tous les écrans. La recherche est celle du poste : tolérance aux fautes de frappe, début de mot, et recherche dans les libellés, notes, étiquettes, propriétés, événements, commentaires, texte des pièces jointes et liens. Un élément trouvé par un de ses événements s'ouvre sur cet événement. Sous chaque résultat, un extrait montre où le mot a été trouvé.

### Fiche d'un élément

Étiquettes, note, photos (toucher pour agrandir), informations, liens, commentaires.

- **Note** : affichée mise en forme (Markdown) ; le crayon ouvre l'édition, **Enregistrer** l'envoie
- **Propriétés** : toucher une valeur pour la modifier, avec la saisie adaptée à son type (texte, nombre, date, oui/non, pays dans une liste) ; les positions restent en lecture seule
- **Événements** : listés par date
- **Onglets** : toucher un onglet range l'élément dedans ou l'en retire
- **Lier** : choisir l'autre élément (recherche, ou création sur place, qui reçoit la date de collecte), le sens, le libellé et la source
- **Supprimer** : la corbeille d'une ligne de lien supprime le lien ; **Supprimer l'élément**, en bas de la fiche, le supprime avec ses liens. Les deux demandent confirmation
 Le **graphe du voisinage** montre l'élément au centre et ses voisins ; **1** / **2** règle le nombre de niveaux, pincer pour zoomer, toucher un voisin pour ouvrir sa fiche. Le bouton retour du téléphone revient à l'élément précédent.

---

## Ce téléphone

{{< hint warning >}}
**Copie non chiffrée.** Le téléphone garde une copie du dossier pour fonctionner hors réseau. Le chiffrement local du poste ne s'applique pas à cette copie : protégez le téléphone par un code de verrouillage.
{{< /hint >}}

- **Réglages** (roue dentée en haut à droite) : nom affiché, état de la connexion, modifications en attente
- **Oublier ce dossier** efface la copie et le lien du téléphone ; les modifications non envoyées sont perdues

### iPhone : ajouter à l'écran d'accueil

Safari peut effacer les données d'un site non ouvert depuis 7 jours, captures en attente comprises. Ajoutez le compagnon à l'écran d'accueil (bouton **Partager** de Safari → **Sur l'écran d'accueil**) pour éviter cet effacement.

---

## Limites

- Ouvrir un dossier sur le téléphone télécharge tout son contenu, pièces jointes comprises
- Depuis le téléphone, un élément existant se modifie par sa note, ses valeurs de propriétés, ses onglets et ses liens (pas son libellé ni ses étiquettes)
- Une note ou des propriétés modifiées hors ligne remplacent, à la reconnexion, la version entière : si le poste a modifié la même note ou les propriétés du même élément entre-temps, une seule des deux versions reste. Évitez de modifier le même élément des deux côtés pendant que le téléphone est hors ligne
- Un dossier clôturé est en lecture seule ; la rétention, propre à chaque poste, ne s'applique pas au téléphone
- Toute personne qui a le lien ou le QR code peut lire et modifier le dossier : il n'y a pas de rôle en lecture seule
