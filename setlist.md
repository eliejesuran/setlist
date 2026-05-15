# SSBBB — Setlist Tool

**Version :** 2026-04-10  
**Auteur :** Elie JESURAN  
**Licence :** GPL  
**Fichier :** `index.html` (app standalone, aucune dépendance serveur)

---

## Vue d'ensemble

Outil de création et gestion de setlists de concerts. Application web entièrement **standalone** (un seul fichier HTML), sans backend ni base de données — tout est en mémoire JS + `localStorage`.

### Dépendances externes (CDN)
| Bibliothèque | Version | Usage |
|---|---|---|
| [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | Génération PDF |
| [html2canvas](https://html2canvas.hertzen.com/) | 1.4.1 | Capture HTML → image pour le PDF |
| Google Fonts | — | `Bebas Neue` + `Space Mono` |

---

## Architecture

L'application est un seul fichier HTML avec trois zones :

```
index.html
├── <head>          : meta, fonts, scripts CDN, styles CSS (minifiés)
├── <body>
│   ├── <header>    : nom du groupe + badges
│   ├── .toolbar    : boutons d'action (sticky)
│   ├── <main>      : liste des titres (#list-body)
│   ├── <footer>    : lieu + date
│   ├── overlays    : import, export, sheet mobile, PDF loading
│   └── <script>    : toute la logique JS (~400 lignes)
```

### État de l'application (variables globales JS)

| Variable | Type | Description |
|---|---|---|
| `items` | `Array<Song\|Sep>` | Liste ordonnée des titres et séparateurs |
| `headerBadges` | `Array<{id, label}>` | Badges affichés dans le header |
| `nextId` | `number` | Compteur pour les IDs des nouveaux items |
| `nextBadgeId` | `number` | Compteur pour les IDs des badges |
| `dragSrcId` | `string\|null` | ID de l'élément en cours de drag |
| `currentTheme` | `string` | Clé du thème actif |

### Structure des données

**Song :**
```js
{
  type: 'song',
  id: 's42',
  title: 'Uptown Funk',
  artist: 'Bruno Mars',
  duration: '3:30',   // format "M:SS"
  comment: 'Note scène...'
}
```

**Separator :**
```js
{
  type: 'sep',
  id: 'sep43',
  label: '— Pause —'
}
```

---

## Fonctionnalités

### 1. Édition de la setlist

- **Nom du groupe** : champ éditable directement dans le header (grande typographie Bebas Neue)
- **Sous-titre** : champ éditable sous le nom (petit, en majuscules dorées) — *à noter : l'input `.subtitle-input` est défini en CSS mais absent du HTML actuel*
- **Badges header** : étiquettes libres (lieu, date, etc.) éditables inline, ajout/suppression dynamique
- **Titres** : chaque song affiche titre, artiste, note scène, durée — tous éditables
- **Séparateurs** : marqueurs de section (ex: "— Pause —") avec calcul automatique de la durée du bloc précédent
- **Réorganisation** : drag & drop sur desktop (HTML5 drag API), non fonctionnel sur mobile (voir limitations)
- **Numérotation** : automatique, recalculée à chaque rendu

### 2. Calculs automatiques

| Calcul | Fonction | Description |
|---|---|---|
| Durée totale | `updateTotals()` | Somme de tous les `duration` des songs |
| Durée par bloc | `subBefore(idx)` | Somme des songs depuis le dernier séparateur |
| Affichage subs | `refreshSubs()` | Met à jour les durées affichées sur les séparateurs |

Format de durée : `M:SS` (ex: `3:45`). La fonction `parseDur()` parse les formats `M:SS` ou secondes brutes.

### 3. Persistance

#### Sauvegarde HTML (`💾`)
Télécharge `index.html` avec l'état courant **injecté dans le JS** (remplacement regex des variables `items`, `headerBadges` et des attributs `value`). Le fichier téléchargé est autonome et réouvrable.

#### Sauvegarde localStorage (`📌`)
Sauvegarde l'état dans `localStorage` sous la clé `ssbbb_setlist_v1`. Restauration automatique au chargement si une sauvegarde existe. Sauvegarde automatique déclenchée 15 secondes après chaque modification (debounce).

```js
// Clé localStorage
const LS_KEY = 'ssbbb_setlist_v1';

// Contenu sauvegardé
{
  items,
  headerBadges,
  bandName,
  footerVenue,
  savedAt  // ISO string
}
```

### 4. Export / Import texte

#### Format texte
```
##BADGES: Bruxelles | 2 juin 2026    (optionnel — 1re ligne, badges séparés par |)
Titre
Titre - Artiste
Titre - Artiste - 3:45
Titre - Artiste - 3:45 - Note scène
---                          (séparateur)
                             (ligne vide = séparateur aussi)
```

#### Import (`📋`)
- Overlay avec textarea libre
- Parser : extrait le **dernier** timing trouvé (`M:SS`) dans chaque ligne, puis découpe par ` - `
- Si la première ligne commence par `##BADGES:`, les badges sont **remplacés** par ceux de la ligne (séparateur `|`)
- Deux modes : **"➕ Ajouter à la fin"** (concatène) ou **"↺ Remplacer"** (remplace toute la liste, avec confirmation)
- Les lignes vides en début de texte ne créent pas de séparateurs parasites

#### Export (`⎘`)
- Overlay avec textarea en lecture seule + bouton "Copier" (clipboard API avec fallback select)
- La première ligne générée est `##BADGES: badge1 | badge2 | …`
- Suivi des titres au même format que l'import → round-trip fidèle (export puis import restitue badges + titres)

### 5. Export PDF

Deux modes disponibles :

| Bouton | Mode | Usage |
|---|---|---|
| `PDF scène Dark` | `dark` | Fond noir, texte clair — pour écran en coulisse |
| `PDF print Light` | `light` | Fond blanc — pour impression papier |

**Option "Export Timing"** : checkbox qui active/désactive l'affichage des durées dans le PDF.

**Processus de génération :**
1. `buildPdfHtml(mode)` : construit le HTML de toutes les pages en A4 (794px de large)
2. Pagination automatique : hauteur estimée par item (42px titre seul, 60px avec commentaire, 28px séparateur) — saut de page anticipé aux séparateurs si la page est remplie à > 60%
3. Overlay "Génération du PDF…" affiché pendant le traitement
4. `html2canvas` capture chaque page (scale ×2 pour qualité)
5. `jsPDF` assemble les images en PDF A4

**Nom de fichier généré :** `ssbbb_{badge1}_{badge2}_{mode}.pdf`

### 6. Thèmes

4 thèmes prédéfinis, sélectionnables via le panneau latéral (`🌈`) :

| Clé | Nom | Description |
|---|---|---|
| `dark-gold` | 🖤 Dark Gold | Thème par défaut |
| `dark-stage` | 🎸 Dark Stage | Violet/indigo sombre |
| `light-paper` | 📄 Light Paper | Beige chaud |
| `light-clean` | ☁️ Light Clean | Blanc épuré |

Les thèmes modifient les variables CSS (`--black`, `--card`, `--gold`, etc.) via `applyTheme()`. Ils ne sont **pas** sauvegardés dans le localStorage.

### 7. Interface mobile

- Layout responsive : en-dessous de 640px, les labels des boutons sont masqués, les champs artiste/commentaire sont cachés
- Le champ titre ouvre un **bottom sheet** au tap (`openSheet()`) pour édition avec un clavier confortable
- **Limitation connue : le drag & drop ne fonctionne pas sur mobile** (API HTML5 non supportée sur touch)

---

## Fonctions principales (référence rapide)

| Fonction | Description |
|---|---|
| `renderList()` | Re-rend toute la liste depuis `items[]` |
| `renderBadges()` | Re-rend les badges du header |
| `makeSong(song, num)` | Crée le DOM d'un titre |
| `makeSep(sep, idx)` | Crée le DOM d'un séparateur |
| `addSong(d)` | Ajoute un titre (avec données optionnelles) |
| `addSep(lbl)` | Ajoute un séparateur |
| `updateTotals()` | Recalcule durée totale + compteur |
| `subBefore(idx)` | Durée du bloc avant l'index donné |
| `refreshSubs()` | Met à jour les durées sur les séparateurs |
| `syncFooter()` | Synchronise le footer avec le header |
| `buildPdfHtml(mode)` | Génère le HTML pour l'export PDF |
| `generatePDF(mode)` | Génère et télécharge le PDF |
| `saveHtml()` | Télécharge le fichier HTML avec l'état courant |
| `exportImportFormat()` | Sérialise la setlist en format texte |
| `lsSave()` / `lsLoad()` | Sauvegarde/restauration localStorage |
| `applyTheme(key)` | Applique un thème CSS |
| `openSheet(song)` | Ouvre le bottom sheet mobile |
| `openThemePanel()` | Crée/affiche le panneau thèmes (lazy) |

---

## Backlog d'améliorations

Les items sont classés par priorité : 🔴 bug / 🟠 robustesse / 🟡 UX / 🟢 mineur.

---

### 🔴 Bugs

#### ~~B1 — Import : lignes vides parasites en début/fin~~ ✅ *corrigé*
~~**Problème :** une ligne vide au début ou à la fin du texte collé crée un séparateur non désiré.~~  
**Implémenté :** dans `parseImport()`, un séparateur n'est créé pour une ligne vide que si au moins un titre a déjà été parsé (`hasItem`). Les séparateurs en fin de liste importée sont également purgés automatiquement.

#### B2 — `saveHtml()` : regex fragile sur `outerHTML`
**Problème :** les remplacements regex ciblent `let items=[...]` dans le HTML brut. Si une note scène contient la chaîne `let items=`, la regex peut produire un fichier corrompu.  
**Fix proposé :** ancrer la regex avec `\blet items=` ou, mieux, injecter l'état via un `<script id="state">` dédié pour un remplacement ciblé et fiable.

#### B3 — `subtitle-input` fantôme
**Problème :** la classe `.subtitle-input` est définie dans le CSS (styles, taille, couleur) mais l'élément HTML correspondant n'existe pas dans le `<body>`. Résidu d'une ancienne version.  
**Fix proposé :** soit supprimer la règle CSS, soit réintégrer l'input dans le `<header>` si la fonctionnalité est souhaitée.

#### B4 — Balises `<meta>` hors `<head>`
**Problème :** les balises `<meta name="author">`, `<meta name="copyright">` etc. sont placées avant la balise `<html>`, donc techniquement hors du document valide. Les navigateurs le tolèrent mais c'est invalide W3C.  
**Fix proposé :** déplacer ces `<meta>` à l'intérieur du `<head>`.

#### B5 — Bloc vide résidu (ligne 197)
**Problème :** `if(item.type==='song') {} // sn already incremented` — bloc vide sans effet, résidu d'un refactoring.  
**Fix proposé :** supprimer la ligne.

---

### 🟠 Robustesse

#### R1 — Thème non persisté
**Problème :** le thème sélectionné n'est sauvegardé ni dans `lsSave()` ni dans `saveHtml()`. Rechargement de page = retour à `dark-gold`.  
**Fix proposé :** ajouter `currentTheme` dans l'objet sauvegardé par `lsSave()`, et l'appliquer au restore. Idem dans `saveHtml()` via la variable `currentTheme`.

#### R2 — Auto-save debounce trop long (15 secondes)
**Problème :** `setTimeout(lsSave, 15000)` — une fermeture accidentelle de l'onglet dans cette fenêtre perd toutes les modifications récentes.  
**Fix proposé :** réduire à 2–3 secondes. Le localStorage est synchrone et rapide, pas de raison de retarder autant.

#### R3 — Badges PDF indexés en dur
**Problème :** `buildPdfHtml` utilise `headerBadges[0]` et `headerBadges[1]` pour le lieu et la date. Si l'utilisateur supprime ou réordonne les badges, le PDF affiche de mauvaises informations.  
**Fix proposé :** utiliser les champs `footer-venue` (lieu) et le dernier badge ou un badge marqué `type:'date'` pour la date, plutôt que des indices.

---

### 🟡 UX

#### ~~U1 — Drag & drop mobile non fonctionnel~~ ✅ *corrigé*
~~L'API HTML5 drag & drop n'est pas supportée sur les interfaces tactiles.~~  
**Implémenté :** boutons **▲ ▼** ajoutés dans `makeSong()`, visibles uniquement sur mobile via `.mob-arrows { display:none }` + media query `display:flex` sous 640px. Le drag & drop desktop est inchangé.

#### U2 — Suppression sans confirmation ni annulation
**Problème :** le `×` supprime un titre immédiatement et de façon irréversible (pas d'undo).  
**Fix proposé :** soit un `confirm('Supprimer ce titre ?')` simple, soit un toast "Titre supprimé — [Annuler]" avec un timeout de 4 secondes qui permet de restaurer l'item.

#### ~~U3 — Import : pas d'option "remplacer"~~ ✅ *corrigé*
~~L'import ajoutait toujours à la fin de la liste existante.~~  
**Implémenté :** l'overlay propose désormais deux boutons — **"➕ Ajouter à la fin"** (comportement historique) et **"↺ Remplacer"** (avec `confirm()` si la liste n'est pas vide). La logique de parsing est extraite dans `parseImport()`, partagée par les deux actions.

#### U4 — Bottom sheet mobile : édition limitée au titre seul
**Problème :** `openSheet()` ne permet d'éditer que le `title`. L'artiste, la durée et la note scène ne sont pas accessibles sur mobile (champs masqués en CSS).  
**Fix proposé :** enrichir le bottom sheet avec les champs artiste, durée et commentaire.

---

### 🟢 Mineur / cosmétique

#### M1 — Thème non sauvegardé dans l'export HTML
Même remarque que R1, mais côté `saveHtml()`. Le fichier téléchargé repart toujours en `dark-gold` même si l'utilisateur avait choisi un autre thème.

#### M2 — Nom de fichier PDF basé sur les 3 premiers badges
Le slug du fichier PDF (`ssbbb_{b1}_{b2}_{b3}_{mode}.pdf`) dépend des badges présents. Si les badges sont vides ou mal nommés, le fichier a un nom peu lisible. Pourrait inclure le nom du groupe et la date systématiquement.

#### M3 — `footer-badge2` non mis à jour par `renderBadges()`
`syncFooter()` lit `headerBadges[1]` pour remplir `#footer-badge2`, mais si l'utilisateur modifie la valeur directement dans le badge (input), le footer se met à jour via `oninput`. En revanche, si le badge est supprimé, `#footer-badge2` garde l'ancienne valeur jusqu'au prochain `syncFooter()`. Comportement acceptable mais légèrement incohérent.

---

## Raccourcis & UX

| Action | Geste |
|---|---|
| Réordonner (desktop) | Drag & drop sur la poignée numérotée |
| Réordonner (mobile) | Boutons ▲ ▼ à droite de chaque titre |
| Éditer titre (mobile) | Tap sur le titre → bottom sheet |
| Supprimer badge | Hover sur le badge → `×` apparaît |
| Sauvegarde rapide | Clic sur `📌` ou attendre 15s après une modif |
| Fermer un overlay | Clic sur le fond sombre ou bouton Fermer/Annuler |

---

*Documentation mise à jour le 15 mai 2026.*
