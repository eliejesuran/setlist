# SSBBB — Setlist Tool

**Version :** 2026-05-16  
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
│   ├── overlays    : texte (import/export fusionné), sheet mobile, PDF loading
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
| `currentTheme` | `string` | Clé du thème actif (`'dark-gold'` ou `'light-paper'`) |

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
- **Réorganisation** : drag & drop sur desktop (HTML5 drag API), boutons ▲ ▼ sur mobile
- **Numérotation** : automatique, recalculée à chaque rendu

### 2. Calculs automatiques

| Calcul | Fonction | Description |
|---|---|---|
| Durée totale | `updateTotals()` | Somme de tous les `duration` des songs |
| Durée par bloc | `subBefore(idx)` | Somme des songs depuis le dernier séparateur |
| Affichage subs | `refreshSubs()` | Met à jour les durées affichées sur les séparateurs |

Format de durée : `M:SS` (ex: `3:45`). La fonction `parseDur()` parse les formats `M:SS` ou secondes brutes.

### 3. Persistance

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

> **Note :** le bouton `💾 Sauvegarder HTML` a été supprimé (U5). La sauvegarde HTML via regex était fragile (voir B2 archivé). Le localStorage est la seule voie de persistance.

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

#### Overlay `📋 Texte` (import + export fusionnés)
- Un seul bouton ouvre un overlay unique pré-rempli avec l'export courant
- **`⎘ Copier`** : copie le texte dans le presse-papiers sans modifier la setlist
- **`↺ Appliquer`** : remplace toute la setlist par le texte modifié (avec confirmation si la liste n'est pas vide)
- Si la première ligne commence par `##BADGES:`, les badges sont **remplacés** par ceux de la ligne (séparateur `|`)
- Les lignes vides en début de texte ne créent pas de séparateurs parasites

### 5. Export PDF

Un seul bouton **`⬇ PDF`** — le mode (dark ou light) est déterminé automatiquement par le **thème actif** :

| Thème actif | Mode PDF | Rendu |
|---|---|---|
| `dark-gold` | `dark` | Fond noir, texte clair — pour écran en coulisse |
| `light-paper` | `light` | Fond blanc — pour impression papier |

**Option "Timing"** : checkbox qui active/désactive l'affichage des durées dans le PDF.

**Processus de génération :**
1. `buildPdfHtml(mode)` : construit le HTML de toutes les pages en A4 (794px de large)
2. Pagination automatique : hauteur estimée par item (42px titre seul, 60px avec commentaire, 28px séparateur) — saut de page anticipé aux séparateurs si la page est remplie à > 60%
3. Overlay "Génération du PDF…" affiché pendant le traitement
4. `html2canvas` capture chaque page (scale ×1.5)
5. `jsPDF` assemble les images — JPEG qualité 0.9 pour le mode light, PNG pour le mode dark

**Nom de fichier généré :** `ssbbb_{badge1}_{badge2}_{mode}.pdf`

### 6. Thèmes

2 thèmes, bascule via le bouton **`☀ Light` / `🌙 Dark`** dans la toolbar :

| Clé | Description | PDF généré |
|---|---|---|
| `dark-gold` | 🖤 Fond noir, or — thème par défaut (scène) | Fond noir |
| `light-paper` | 📄 Beige chaud — impression / répétition | Fond blanc |

Les thèmes modifient les variables CSS (`--black`, `--card`, `--gold`, etc.) via `applyTheme()`. Le thème n'est **pas** sauvegardé dans le localStorage (voir R1).

### 7. Interface mobile

- Layout responsive : en-dessous de 640px, les labels des boutons sont masqués, les champs artiste/commentaire sont cachés
- Le champ titre ouvre un **bottom sheet** au tap (`openSheet()`) pour édition avec un clavier confortable — 4 champs : Titre, Artiste, Durée, Note scène
- Réorganisation via les boutons **▲ ▼** (drag & drop HTML5 non supporté sur touch)

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
| `generatePDF()` | Génère et télécharge le PDF (mode = thème actif) |
| `exportImportFormat()` | Sérialise la setlist en format texte |
| `parseImport(text)` | Parse le format texte → `{imported, badgesParsed}` |
| `lsSave()` / `lsLoad()` | Sauvegarde/restauration localStorage |
| `applyTheme(key)` | Applique un thème CSS |
| `openSheet(song)` | Ouvre le bottom sheet mobile |

---

## Backlog d'améliorations

Les items sont classés par priorité : 🔴 bug / 🟠 robustesse / 🟡 UX / 🟢 mineur.

---

### 🔴 Bugs

#### ~~B1 — Import : lignes vides parasites en début/fin~~ ✅ *corrigé*
~~**Problème :** une ligne vide au début ou à la fin du texte collé crée un séparateur non désiré.~~  
**Implémenté :** dans `parseImport()`, un séparateur n'est créé pour une ligne vide que si au moins un titre a déjà été parsé (`hasItem`). Les séparateurs en fin de liste importée sont également purgés automatiquement.

#### ~~B2 — `saveHtml()` : regex fragile sur `outerHTML`~~ ✅ *non pertinent (U5)*
~~**Problème :** les remplacements regex ciblent `let items=[...]` dans le HTML brut. Si une note scène contient la chaîne `let items=`, la regex peut produire un fichier corrompu.~~  
**Résolu par suppression :** le bouton `saveHtml()` a été retiré (U5). La persistance repose uniquement sur le localStorage.

#### ~~B3 — `subtitle-input` fantôme~~ *(toujours présent)*
**Problème :** la classe `.subtitle-input` est définie dans le CSS mais l'élément HTML correspondant n'existe pas dans le `<body>`.  
**Fix proposé :** supprimer la règle CSS ou réintégrer l'input dans le `<header>`.

#### ~~B4 — Balises `<meta>` hors `<head>`~~ *(toujours présent)*
**Problème :** les balises `<meta name="author">` etc. sont placées avant `<html>`, invalide W3C.  
**Fix proposé :** déplacer ces `<meta>` à l'intérieur du `<head>`.

#### ~~B5 — Bloc vide résidu~~ *(toujours présent)*
**Problème :** `if(item.type==='song') {}` — bloc vide sans effet dans `buildPdfHtml`.  
**Fix proposé :** supprimer la ligne.

#### ~~B6 — Toolbar invisible en thème clair~~ ✅ *corrigé*
~~**Problème :** en thème clair, la barre d'outils gardait un fond quasi-noir `rgba(10,10,10,.97)` hardcodé.~~  
**Implémenté :** `.toolbar` utilise désormais `background:var(--card)`, s'adaptant correctement à tous les thèmes.

#### B7 — Overlay Texte illisible en thème clair
**Problème :** la `.import-box` et la `.import-ta` ont leurs couleurs de fond et de texte codées en dur (`#141414`, `#1a1a1a`, `color:var(--white)`). En thème `light-paper`, `--white` vaut `#1a1208` (quasi-noir), ce qui produit du texte noir sur fond noir dans la textarea.  
**Fix proposé :** remplacer les couleurs hardcodées de `.import-box` et `.import-ta` par des variables CSS thémées :
```css
.import-box { background: var(--card); border-color: var(--border); }
.import-ta  { background: var(--black); color: var(--white); border-color: var(--border); }
```

---

### 🟠 Robustesse

#### R1 — Thème non persisté
**Problème :** le thème sélectionné n'est pas sauvegardé dans `lsSave()`. Rechargement de page = retour à `dark-gold`.  
**Fix proposé :** ajouter `currentTheme` dans l'objet sauvegardé par `lsSave()`, et l'appliquer au restore.

#### R2 — Auto-save debounce trop long (15 secondes)
**Problème :** `setTimeout(lsSave, 15000)` — une fermeture accidentelle de l'onglet peut perdre les modifications récentes.  
**Fix proposé :** réduire à 2–3 secondes.

#### R3 — Badges PDF indexés en dur
**Problème :** `buildPdfHtml` utilise `headerBadges[0]` et `headerBadges[1]` pour le lieu et la date. Si l'utilisateur supprime ou réordonne les badges, le PDF affiche de mauvaises informations.  
**Fix proposé :** utiliser les champs `footer-venue` et le dernier badge, ou introduire un badge `type:'date'`.

#### ~~R4 — PDF trop lourd (~14 Mo/page)~~ ✅ *corrigé*
~~**Problème :** `html2canvas` capturait à `scale:2` en PNG non compressé → ~14 Mo/page.~~  
**Implémenté :** `scale` réduit à `1.5` ; mode light utilise JPEG qualité 0.9 au lieu de PNG. Gain attendu ×4–6 sur les pages light, ×1.8 sur les pages dark.

---

### 🟡 UX

#### ~~U1 — Drag & drop mobile non fonctionnel~~ ✅ *corrigé*
**Implémenté :** boutons **▲ ▼** dans `makeSong()`, visibles uniquement sur mobile via media query.

#### ~~U2 — Suppression sans confirmation ni annulation~~ ✅ *corrigé*
**Implémenté :** toast avec bouton **Annuler** (4 secondes) après chaque suppression.

#### ~~U3 — Import : pas d'option "remplacer"~~ ✅ *corrigé*
**Implémenté :** voir U7 — l'overlay unique avec `↺ Appliquer` remplace la setlist.

#### ~~U4 — Bottom sheet mobile : édition limitée au titre seul~~ ✅ *corrigé*
**Implémenté :** 4 champs dans le sheet — Titre, Artiste, Durée, Note scène.

#### ~~U5 — Suppression du bouton "Sauvegarder HTML" (`💾`)~~ ✅ *corrigé*
~~**Problème :** bouton rarement utilisé, sauvegarde HTML via regex fragile.~~  
**Implémenté :** bouton et fonction `saveHtml()` supprimés. Persistance assurée par le localStorage uniquement.

#### ~~U6 — Thème : remplacer le panneau par un toggle Dark/Light~~ ✅ *corrigé*
~~**Problème :** panneau à 4 thèmes surdimensionné, 2 boutons PDF redondants.~~  
**Implémenté :** thèmes réduits à `dark-gold` et `light-paper`. Bouton toggle **`☀ Light` / `🌙 Dark`** dans la toolbar. Un seul bouton **`⬇ PDF`** qui génère dans le thème actif. Dépendait de B6 (corrigé).

#### ~~U7 — Fusion Import / Export en un seul overlay~~ ✅ *corrigé*
~~**Problème :** deux boutons et deux overlays distincts pour import et export.~~  
**Implémenté :** bouton unique **`📋 Texte`** ouvrant un overlay pré-rempli avec l'export courant. Boutons **`⎘ Copier`** et **`↺ Appliquer`**. −1 bouton, −1 overlay.

#### M1 — Thème non sauvegardé dans l'export HTML
*(Même remarque que R1, désormais sans objet puisque `saveHtml` est supprimé.)*

#### M2 — Nom de fichier PDF basé sur les 3 premiers badges
Le slug `ssbbb_{b1}_{b2}_{b3}_{mode}.pdf` dépend des badges présents. Pourrait inclure le nom du groupe systématiquement.

#### M3 — `footer-badge2` non mis à jour à la suppression d'un badge
`syncFooter()` lit `headerBadges[1]` pour remplir `#footer-badge2`, mais si ce badge est supprimé, le footer garde l'ancienne valeur jusqu'au prochain `syncFooter()`.

---

## Raccourcis & UX

| Action | Geste |
|---|---|
| Réordonner (desktop) | Drag & drop sur la poignée numérotée |
| Réordonner (mobile) | Boutons ▲ ▼ à droite de chaque titre |
| Éditer titre (mobile) | Tap sur le titre → bottom sheet |
| Supprimer badge | Hover sur le badge → `×` apparaît |
| Sauvegarde rapide | Clic sur `📌` ou attendre 15s après une modif |
| Basculer thème | Bouton `☀ / 🌙` dans la toolbar |
| Fermer un overlay | Clic sur le fond sombre ou bouton Fermer |

---

*Documentation mise à jour le 16 mai 2026.*
