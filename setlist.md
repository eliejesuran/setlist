# SSBBB — Setlist Tool

**Version :** 2026-05-19  
**Auteur :** Elie JESURAN  
**Licence :** GPL  
**Fichier :** `index.html` (app standalone, aucune dépendance serveur)

---

## Vue d'ensemble

Outil de création et gestion de setlists de concerts. Application web entièrement **standalone** (un seul fichier HTML), sans backend ni base de données — tout est en mémoire JS + `localStorage`. La fonctionnalité de partage collaboratif repose sur un mini-serveur WebSocket séparé (`server/server.js`) déployé sur Fly.io.

### Dépendances externes (CDN)
| Bibliothèque | Version | Usage |
|---|---|---|
| [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | Génération PDF |
| [html2canvas](https://html2canvas.hertzen.com/) | 1.4.1 | Capture HTML → image pour le PDF |
| Google Fonts | — | `Bebas Neue` + `Space Mono` |

---

## Architecture

```
repo/
├── index.html          : app cliente standalone
└── server/
    ├── server.js       : serveur WebSocket (Node 20 + ws)
    ├── package.json
    ├── fly.toml        : config déploiement Fly.io
    ├── .env.example
    └── .gitignore      : exclut node_modules/ et .env
```

### Structure de `index.html`

```
index.html
├── <head>          : meta, fonts, scripts CDN, styles CSS (minifiés)
├── <body>
│   ├── <header>    : nom du groupe + badges
│   ├── .toolbar    : boutons d'action (sticky)
│   ├── <main>      : liste des titres (#list-body)
│   ├── <footer>    : lieu + date
│   ├── overlays    : partage, texte (import/export fusionné), sheet mobile, PDF loading
│   └── <script>    : toute la logique JS (~650 lignes)
```

### État de l'application (variables globales JS)

| Variable | Type | Description |
|---|---|---|
| `items` | `Array<Song\|Sep>` | Liste ordonnée des titres et séparateurs |
| `headerBadges` | `Array<{id, label}>` | Badges affichés dans le header |
| `nextId` | `number` | Compteur pour les IDs des nouveaux items |
| `nextBadgeId` | `number` | Compteur pour les IDs des badges |
| `dragSrcId` | `string\|null` | ID de l'élément en cours de drag |
| `currentTheme` | `string` | Clé du thème actif (`'dark-gold'`, `'sepia'`, `'light-paper'`) |
| `ws` | `WebSocket\|null` | Connexion WebSocket active (null si hors session) |
| `wsSessionId` | `string\|null` | ID de la session collaborative active |
| `wsSuppressPatch` | `boolean` | Verrou anti-boucle : empêche de ré-émettre un patch reçu |

### Structure des données

**Song :**
```js
{
  type: 'song',
  id: 's42',
  title: 'Uptown Funk',
  artist: 'Bruno Mars',
  duration: '3:30',    // format "M:SS"
  comment: 'Note scène...',
  privateUrl:  '',     // lien privé (non imprimé, non exporté en texte)
  privateNote: ''      // note longue privée (non imprimée, non exportée en texte)
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
const LS_KEY = 'ssbbb_setlist_v1';

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
##BADGES: Mon groupe | Date    (optionnel — 1re ligne, badges séparés par |)
Titre
Titre - Artiste
Titre - Artiste - 3:45
Titre - Artiste - 3:45 - Note scène
---                             (séparateur)
                                (ligne vide = séparateur aussi)
```

#### Overlay `📋 Texte`
- Un seul bouton, overlay pré-rempli avec l'export courant
- **`⎘ Copier`** : copie dans le presse-papiers sans modifier la setlist
- **`↺ Appliquer`** : remplace toute la setlist (avec confirmation)
- Les lignes vides en début de texte ne créent pas de séparateurs parasites

### 5. Export PDF

Bouton **`⬇ PDF`** — mode déterminé automatiquement par le thème actif :

| Thème actif | Mode PDF | Rendu |
|---|---|---|
| `dark-gold` | `dark` | Fond noir, texte clair — pour écran en coulisse |
| `sepia` / `light-paper` | `light` | Fond blanc — pour impression papier |

**Option "Timing"** : checkbox qui active/désactive l'affichage des durées dans le PDF.

Pagination automatique : 42px/titre, 60px/titre+commentaire, 28px/séparateur. Saut de page anticipé aux séparateurs si la page est remplie à > 60%.

**Nom de fichier généré :** `ssbbb_{badge1}_{badge2}_{mode}.pdf`

### 6. Thèmes

3 thèmes en cycle via le bouton **`☀ / 📜 / 🌙`** (Dark → Sépia → Light) :

| Clé | Description | PDF |
|---|---|---|
| `dark-gold` | 🖤 Fond noir, or — scène | Fond noir, scale ×1.5 |
| `sepia` | 📜 Ocre jauni — répétition | Fond blanc, scale ×2 |
| `light-paper` | ☁️ Blanc épuré — impression | Fond blanc, scale ×2 |

### 7. Interface mobile

- En-dessous de 640px : labels masqués, champs artiste/commentaire cachés
- Tap sur un titre → **bottom sheet** (4 champs : Titre, Artiste, Durée, Note scène)
- Réorganisation via les boutons **▲ ▼**

### 8. Sessions collaboratives (`🔗 Partager`)

Partage en temps réel via WebSocket — serveur Node.js sur Fly.io (`wss://ssbbb-server.fly.dev`, Paris).

**Flux :**
1. `🔗 Partager` → saisir son nom → `🌐 Mettre en ligne` → génère un `sessionId` (8 chars)
2. L'URL est mise à jour : `?s=abc12345`, le nom saisi apparaît dans le bouton toolbar
3. Le lien est envoyé aux membres → connexion automatique à l'ouverture
4. Chaque modification est broadcastée via `wsPatch()` → `wsApplyState()` chez les autres

**Bouton `+ Nouvelle session`** : crée une setlist vide en mode offline, déconnecte la session active.

**Protocole WebSocket :**

| Type | Émetteur | Description |
|---|---|---|
| `patch` | client | État complet après chaque modification |
| `init` | serveur | État envoyé au nouveau pair à la connexion |
| `joined` | serveur | Confirmation si la session est vide |
| `peer_joined` / `peer_left` | serveur | Notification d'arrivée/départ |
| `session_expired` | serveur | Session expirée (TTL 8h) |
| `ping` / `pong` | client/serveur | Keepalive |

**Indicateur de statut :** rond dans la toolbar — gris (offline), orange (connexion), vert (connecté).

**Reconnexion automatique** toutes les 5s si la connexion tombe.

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
| `generatePDF()` | Génère et télécharge le PDF |
| `exportImportFormat()` | Sérialise la setlist en format texte |
| `parseImport(text)` | Parse le format texte → `{imported, badgesParsed}` |
| `lsSave()` / `lsLoad()` | Sauvegarde/restauration localStorage |
| `applyTheme(key)` | Applique un thème CSS |
| `openSheet(song)` | Ouvre le bottom sheet mobile/desktop |
| `wsConnect(sessionId)` | Ouvre la connexion WebSocket |
| `wsDisconnect()` | Ferme la connexion et nettoie l'URL |
| `wsPatch()` | Émet l'état courant vers le serveur |
| `wsApplyState(state)` | Applique un état reçu sans ré-émettre |
| `wsPeerName()` | Retourne le nom saisi dans l'overlay de partage |

---

## Backlog — À faire

Les items sont classés par priorité : 🔴 bug / 🟠 robustesse / 🟡 UX / 🟢 mineur.

---

### 🔴 Bugs

#### B8 — Modifications offline écrasées à la reconnexion
**Problème :** si un membre modifie la setlist offline puis rejoint une session, `wsApplyState()` écrase ses modifications locales sans avertissement.  
**Fix :** à la réception d'un `init`, comparer le `savedAt` du localStorage avec le timestamp serveur et proposer un choix ("Garder mes modifs" / "Prendre la version du groupe").

---

### 🟠 Robustesse

#### R2 — Auto-save debounce trop long (15 secondes)
**Problème :** une fermeture accidentelle de l'onglet peut perdre les modifications récentes.  
**Fix :** réduire à 2–3 secondes.

#### R3 — Badges PDF indexés en dur
**Problème :** `buildPdfHtml` utilise `headerBadges[0]` et `headerBadges[1]`. Si l'utilisateur supprime ou réordonne les badges, le PDF affiche de mauvaises informations.  
**Fix :** utiliser `footer-venue` et le dernier badge, ou introduire un badge `type:'date'`.

---

### 🟡 UX

#### U11 — Bottom sheet : ne suit pas le thème actif
**Problème :** le `.sheet` a son fond codé en dur (`background:#1c1c1c`) et les inputs `.sh-inp` utilisent `background:rgba(255,255,255,.04)` et `color:var(--white)`. En thèmes `sepia` et `light-paper`, la fenêtre reste noire/sombre, texte illisible sur fond clair.  
**Fix proposé :** remplacer les valeurs hardcodées du `.sheet` et des `.sh-inp` par des variables CSS thémées :
```css
.sheet { background: var(--card); }
.sh-inp { background: var(--black); color: var(--white); border-color: var(--border); }
.sh-lbl { color: var(--muted); }
.sheet-ttl { color: var(--gold); }
.sheet-close { background: var(--black); border-color: var(--border); color: var(--grey); }
```
Même correctif à appliquer au `.sheet-ov` (fond semi-transparent déjà OK via `rgba`).

#### U12 — Bottom sheet mobile : bouton "Fermer" inaccessible avec le clavier ouvert
**Problème :** sur mobile, le clavier virtuel réduit la hauteur visible. Le bouton "Fermer" est en bas du sheet et disparaît sous le clavier, rendant la fermeture difficile sans scroller ou taper ailleurs.  
**Fix proposé :** déplacer le bouton "Fermer" en haut à droite du sheet (position absolute dans le header du sheet, à côté du titre), de façon à ce qu'il reste toujours visible au-dessus du clavier :
```html
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
  <div class="sheet-ttl" id="sh-name">—</div>
  <button class="sheet-close-top" id="sh-close">✕</button>
</div>
```
Garder optionnellement un bouton secondaire en bas pour desktop.

#### U13 — Boutons thème et nouvelle session : position dans la toolbar
**Problème :** sur mobile et desktop, les boutons "toggle thème" et "+ Nouvelle session" sont noyés dans la barre d'outils avec les autres actions. Ils sont moins fréquemment utilisés et encombrent l'espace.  
**Fix proposé :** déplacer ces deux boutons en haut à droite de l'interface (corner fixe ou fin du header), séparés des actions principales de la toolbar. Sur mobile, cela libère de l'espace dans la barre sticky pour les actions du quotidien (PDF, Texte, Partager).

#### U9 — Masquer `📋 Texte` et `📌 Sauvegarde` quand connecté en session
**Problème :** ces boutons sont redondants voire trompeurs quand une session WS est active.  
**Fix :** dans `wsUpdateShareUI()`, masquer ou griser ces deux boutons quand `ws.readyState === WebSocket.OPEN`, les réafficher à la déconnexion.

---

### 🟢 Mineurs

#### M2 — Nom de fichier PDF basé sur les badges
Le slug `ssbbb_{b1}_{b2}_{mode}.pdf` dépend des badges. Pourrait inclure le nom du groupe systématiquement.

#### M3 — `footer-badge2` non mis à jour à la suppression d'un badge
`syncFooter()` lit `headerBadges[1]` — si ce badge est supprimé, le footer garde l'ancienne valeur jusqu'au prochain `syncFooter()`.

---

## Raccourcis & UX

| Action | Geste |
|---|---|
| Réordonner (desktop) | Drag & drop sur la poignée numérotée |
| Réordonner (mobile) | Boutons ▲ ▼ à droite de chaque titre |
| Éditer titre / champs privés | Bouton ✎ (desktop) ou tap sur le titre (mobile) → sheet |
| Supprimer badge | Hover sur le badge → `×` apparaît |
| Sauvegarde rapide | Clic sur `📌` ou attendre 15s après une modif |
| Basculer thème | Bouton `☀ / 📜 / 🌙` dans la toolbar |
| Nouvelle session offline | Bouton `+` dans la toolbar |
| Partager / mettre en ligne | Bouton `🔗` → saisir son nom → `🌐 Mettre en ligne` |
| Rejoindre une session | Ouvrir le lien `?s=abc12345` |
| Ouvrir un lien privé | Clic sur l'icône `🔗` à droite du titre |
| Fermer un overlay | Clic sur le fond sombre ou bouton Fermer |

---

## Historique — Déjà réalisé

### 🔴 Bugs corrigés

#### ~~B1 — Import : lignes vides parasites en début/fin~~ ✅
Dans `parseImport()`, un séparateur n'est créé que si au moins un titre a déjà été parsé (`hasItem`). Les séparateurs en fin de liste importée sont purgés automatiquement.

#### ~~B2 — `saveHtml()` : regex fragile sur `outerHTML`~~ ✅ *(non pertinent)*
Résolu par suppression : `saveHtml()` retiré (U5). Persistance via localStorage uniquement.

#### ~~B3 — `subtitle-input` fantôme~~ ✅
Règle CSS `.subtitle-input` supprimée (élément absent du HTML).

#### ~~B4 — Balises `<meta>` hors `<head>`~~ ✅
Les 4 balises `<meta>` déplacées à l'intérieur du `<head>`, après `<html lang="fr">`.

#### ~~B5 — Bloc vide résidu~~ ✅
Ligne `if(item.type==='song') {}` supprimée dans `buildPdfHtml`.

#### ~~B6 — Toolbar invisible en thème clair~~ ✅
`.toolbar` utilise désormais `background:var(--card)`.

#### ~~B7 — Overlay Texte illisible en thème clair~~ ✅
`.import-box` → `var(--card)` / `var(--border)` ; `.import-ta` → `var(--black)` / `var(--white)` / `var(--border)`.

#### ~~B9 — Modifications de badges non propagées immédiatement via WS~~ ✅
`wsPatch()` appelé à la fin de `renderBadges()`.

---

### 🟠 Robustesse — Réalisé

#### ~~R1 — Thème non persisté~~ ✅ *(sans objet)*
Comportement accepté : le thème par défaut `dark-gold` est le bon pour une utilisation scène.

#### ~~R4 — PDF trop lourd (~14 Mo/page)~~ ✅
Scale différencié : `1.5` pour dark, `2` pour light/sépia. Mode light en JPEG qualité 1.0.

#### ~~R5 — Pas de protection anti-bot sur le serveur WS~~ ✅
Origin check + rate limiting (max 10 connexions/min/IP) + taille des messages limitée à 128 Ko.

---

### 🟡 UX — Réalisé

#### ~~U1 — Drag & drop mobile non fonctionnel~~ ✅
Boutons **▲ ▼** dans `makeSong()`, visibles uniquement sur mobile via media query.

#### ~~U2 — Suppression sans confirmation ni annulation~~ ✅
Toast avec bouton **Annuler** (4 secondes) après chaque suppression.

#### ~~U3 — Import : pas d'option "remplacer"~~ ✅
Voir U7.

#### ~~U4 — Bottom sheet mobile : édition limitée au titre seul~~ ✅
4 champs dans le sheet : Titre, Artiste, Durée, Note scène.

#### ~~U5 — Suppression du bouton "Sauvegarder HTML"~~ ✅
Bouton et fonction `saveHtml()` supprimés. Persistance via localStorage.

#### ~~U6 — Thème : remplacer le panneau par un toggle Dark/Light~~ ✅
3 thèmes en cycle, un seul bouton PDF, mode PDF déterminé par le thème actif.

#### ~~U7 — Fusion Import / Export en un seul overlay~~ ✅
Bouton unique `📋 Texte` avec `⎘ Copier` et `↺ Appliquer`.

#### ~~U8 — Partage de session collaborative via lien~~ ✅
Bouton `🔗 Partager` + bouton `+ Nouvelle session`. Serveur WebSocket sur Fly.io (`wss://ssbbb-server.fly.dev`), Paris. Sessions 8 chars, TTL 8h, max 100 sessions / 20 peers. Reconnexion auto toutes les 5s. URL `?s=abc12345` pour rejoindre directement.

#### ~~U10 — Données génériques au premier lancement~~ ✅
Setlist vide, nom "Mon Groupe", badges "Mon groupe" / "Date" par défaut.

#### ~~M4 — Lien + note longue privés par titre~~ ✅
Champs `privateUrl` et `privateNote` ajoutés à la structure `Song`. Accessibles via le sheet. Icône `🔗` discret si `privateUrl` renseigné. Exclus du PDF et du format texte. Synchronisés via WebSocket.

---

### 🟢 Mineurs — Réalisé

#### ~~M1 — Thème non sauvegardé dans l'export HTML~~ ✅ *(sans objet)*
Sans objet depuis la suppression de `saveHtml()` (U5).

---

*Documentation mise à jour le 19 mai 2026.*
