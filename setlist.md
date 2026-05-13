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
- **Ajoute** les titres importés à la fin de la liste existante (ne remplace pas)

#### Export (`⎘`)
- Overlay avec textarea en lecture seule + bouton "Copier" (clipboard API avec fallback select)
- Génère le même format que l'import → round-trip fidèle

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

## Limitations connues & axes d'amélioration

### Bug confirmé
- **Drag & drop mobile** : non fonctionnel. Pistes : bibliothèque `Sortable.js`, ou implémentation manuelle via événements `touchstart`/`touchmove`/`touchend`

### Autres pistes identifiées
- Le thème choisi n'est pas persisté (ni localStorage, ni sauvegarde HTML)
- L'import ajoute toujours à la fin — pas d'option "remplacer"
- Le `subtitle-input` est défini en CSS mais jamais inséré dans le HTML
- La sauvegarde HTML utilise des remplacements regex fragiles sur `outerHTML`
- Pas de gestion d'annulation (undo/redo)
- Pas de confirmation avant suppression d'un titre

---

## Raccourcis & UX

| Action | Geste |
|---|---|
| Réordonner | Drag & drop sur la poignée numérotée |
| Éditer titre (mobile) | Tap sur le titre → bottom sheet |
| Supprimer badge | Hover sur le badge → `×` apparaît |
| Sauvegarde rapide | Clic sur `📌` ou attendre 15s après une modif |
| Fermer un overlay | Clic sur le fond sombre ou bouton Fermer/Annuler |

---

*Documentation générée le 13 mai 2026.*
