# SSBBB — Setlist Tool

**Version :** 2026-05-21  
**Auteur :** Elie JESURAN  
**Licence :** GPL  
**Fichier :** `index.html` (app standalone, aucune dépendance serveur)

---

## Vue d'ensemble

Outil de création et gestion de setlists de concerts. Application web entièrement **standalone** (un seul fichier HTML), sans backend ni base de données — tout est en mémoire JS + `localStorage`. La fonctionnalité de partage collaboratif repose sur un mini-serveur WebSocket séparé (`server/server.js`) déployé sur Render.

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
    ├── fly.toml        : config déploiement Fly.io (obsolète — conservé pour référence)
    ├── .env.example
    └── .gitignore      : exclut node_modules/ et .env
```

### Structure de `index.html`

```
index.html
├── <head>          : meta, fonts, scripts CDN, styles CSS (minifiés)
├── <body>
│   ├── <header>    : nom du groupe + badges + boutons thème/nouveau (coin haut-droit)
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

## Infrastructure

### Serveur WebSocket

| Paramètre | Valeur |
|---|---|
| Hébergeur | Render (tier gratuit) |
| URL | `wss://setlist-21hb.onrender.com` |
| Ancien hébergeur | Fly.io (abandonné — fin période d'essai) |
| Keep-alive | UptimeRobot ping `/healthz` toutes les 5 min |
| Sleep si inactif | ~1 min de cold start si UptimeRobot ne tourne pas |

### Front-end (index.html)

| Paramètre | Valeur |
|---|---|
| Hébergeur cible | Infomaniak (`jesuran.be`) |
| Statut | ⏳ Migration en cours — fichier non encore déployé |

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

3 thèmes en cycle via le bouton **`☀ / 📜 / 🌙`** (Dark → Sépia → Light), déplacé dans le coin haut-droit du header :

| Clé | Description | PDF |
|---|---|---|
| `dark-gold` | 🖤 Fond noir, or — scène | Fond noir, scale ×1.5 |
| `sepia` | 📜 Ocre jauni — répétition | Fond blanc, scale ×2 |
| `light-paper` | ☁️ Blanc épuré — impression | Fond blanc, scale ×2 |

### 7. Interface mobile

- En-dessous de 640px : labels masqués, champs artiste/commentaire cachés
- Tap sur un titre → **bottom sheet** (Titre, Artiste, Durée, Note scène, Lien privé, Note privée)
- Bouton ✕ en haut à droite du sheet (toujours visible au-dessus du clavier)
- Réorganisation via les boutons **▲ ▼**

### 8. Sessions collaboratives (`🔗 Partager`)

Partage en temps réel via WebSocket — serveur Node.js sur Render (`wss://setlist-21hb.onrender.com`).

**Flux :**
1. `🔗 Partager` → saisir son nom → `🌐 Mettre en ligne` → génère un `sessionId` (8 chars)
2. L'URL est mise à jour : `?s=abc12345`, le nom saisi apparaît dans le bouton toolbar
3. Le lien est envoyé aux membres → connexion automatique à l'ouverture
4. Chaque modification est broadcastée via `wsPatch()` → `wsApplyState()` chez les autres

**Bouton `+ Nouveau`** (coin haut-droit header) : crée une setlist vide en mode offline, déconnecte la session active.

**Protocole WebSocket :**

| Type | Émetteur | Description |
|---|---|---|
| `patch` | client | État complet après chaque modification |
| `init` | serveur | État envoyé au nouveau pair à la connexion |
| `joined` | serveur | Confirmation si la session est vide |
| `peer_joined` / `peer_left` | serveur | Notification d'arrivée/départ |
| `session_expired` | serveur | Session expirée (TTL 15j) |
| `ping` / `pong` | client/serveur | Keepalive |

**Indicateur de statut :** rond dans la toolbar — gris (offline), orange (connexion), vert (connecté).

**Reconnexion automatique** toutes les 5s si la connexion tombe.

**U9 :** boutons `📋 Texte` et `📌 Sauvegarde` grisés quand une session est active (source de vérité = serveur).

**U14 :** TTL restant de la session affiché dans l'overlay de partage.

### 9. Champs privés par titre

Deux champs optionnels dans la structure `Song`, accessibles via le sheet (bouton ✎ desktop ou tap mobile) :
- `privateUrl` : lien (YouTube, etc.) — icône 🔗 discret dans la liste si renseigné
- `privateNote` : note longue (accord de départ, arrangement…)

Ces champs sont **exclus** du PDF et du format texte d'échange. Synchronisés via WebSocket comme le reste de l'état.

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
| `wsUpdateTtl()` | Affiche le TTL restant de la session |

---

## Backlog — À faire

Les items sont classés par priorité : 🔴 bug / 🟠 robustesse / 🟡 UX / 🟢 mineur / 🔧 infra.

### Backlog à trier dans les catégories plus bas:

- []

---

### 🔧 Infra

#### I2 — Déployer index.html sur Infomaniak
**Contexte :** `index.html` est encore servi localement / depuis GitHub Pages.  
**À faire :** déposer `index.html` dans le dossier web de `jesuran.be` via FTP ou gestionnaire de fichiers Infomaniak. Vérifier que `ALLOWED_ORIGINS` dans `server.js` inclut bien `https://jesuran.be` et `https://www.jesuran.be`.

---

### 🔴 Bugs

#### B8 — Modifications offline écrasées à la reconnexion
**Problème :** si un membre modifie la setlist offline puis rejoint une session, `wsApplyState()` écrase ses modifications locales sans avertissement.  
**Fix :** à la réception d'un `init`, comparer le `savedAt` du localStorage avec le timestamp serveur et proposer un choix ("Garder mes modifs" / "Prendre la version du groupe").

#### B9 Insertion des morceaux et deplacement des morceaux dans des sessions partagées non cohérentes

####

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

#### ~~U11~~ WARNING Bottom sheet : ne suit pas le thème actif WARNING - toujours le soucis

#### UX 17 donner la liste des gens connectés sur la sessions, 
#### UX 18 Gérer les sessions (possibilité de les supprimer, voir si y'en a pas trop)
#### UX 19 Donner des noms aux sessions, avec la possibilité de se connecter sur la bonne session.
#### UX 20 Changer la couleur des infos pour les sessions (peu visible)
#### UX 21 Changer la couleur des infosbox en sepia et light mode
#### UX 22 Changer le message de confirmation dans l'export de texte en information temporaire (infos box)
#### UX 23 Possibilité dans l'export d'exporter en plus: Le nom du groupe, les options d'impression, le lieu.

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
| Basculer thème | Bouton `☀ / 📜 / 🌙` (coin haut-droit header) |
| Nouvelle setlist offline | Bouton `+` (coin haut-droit header) |
| Partager / mettre en ligne | Bouton `🔗` → saisir son nom → `🌐 Mettre en ligne` |
| Rejoindre une session | Ouvrir le lien `?s=abc12345` |
| Ouvrir un lien privé | Clic sur l'icône `🔗` à droite du titre |
| Fermer un overlay | Clic sur le fond sombre ou bouton ✕ |

---

## Historique — Déjà réalisé

### 🔧 Infra

#### ~~I0~~ ✅ Migration Fly.io → Render
Fly.io abandonné (fin période d'essai gratuite). Serveur redéployé sur Render (tier gratuit).  
URL : `wss://setlist-21hb.onrender.com`. Keep-alive via UptimeRobot (ping `/healthz` toutes les 5 min).  
`server.js` adapté : HTTP + WebSocket sur le même port via `httpServer` partagé (exigence Render).  
`ALLOWED_ORIGINS` mis à jour pour inclure `jesuran.be`.
#### ~~I1~~ ✅ Tester le nouveau serveur Render


### 🔴 Bugs corrigés

#### ~~B1~~ ✅ Import : lignes vides parasites en début/fin
#### ~~B2~~ ✅ `saveHtml()` regex fragile *(non pertinent — U5)*
#### ~~B3~~ ✅ `.subtitle-input` fantôme — règle CSS supprimée
#### ~~B4~~ ✅ Balises `<meta>` hors `<head>` — déplacées dans `<head>`
#### ~~B5~~ ✅ Bloc vide résidu dans `buildPdfHtml` — supprimé
#### ~~B6~~ ✅ Toolbar invisible en thème clair — `background:var(--card)`
#### ~~B7~~ ✅ Overlay Texte illisible en thème clair — variables CSS thémées
#### ~~B9~~ ✅ Badges non propagés via WS — `wsPatch()` appelé dans `renderBadges()`

### 🟠 Robustesse — Réalisé

#### ~~R1~~ ✅ Thème non persisté *(sans objet — comportement accepté)*
#### ~~R4~~ ✅ PDF trop lourd — scale différencié 1.5/2, JPEG pour light
#### ~~R5~~ ✅ Pas de protection anti-bot — origin check + rate limiting + taille messages 128 Ko

### 🟡 UX — Réalisé

#### ~~U1~~ ✅ Drag & drop mobile — boutons ▲ ▼
#### ~~U2~~ ✅ Suppression sans annulation — toast 4s avec Annuler
#### ~~U3~~ ✅ Import sans option remplacer — voir U7
#### ~~U4~~ ✅ Bottom sheet limité au titre — 4 champs puis 6 avec champs privés
#### ~~U5~~ ✅ Suppression bouton Sauvegarder HTML
#### ~~U6~~ ✅ Toggle thème 3 états, déplacé dans le header
#### ~~U7~~ ✅ Fusion Import / Export — bouton `📋 Texte`
#### ~~U8~~ ✅ Sessions collaboratives via lien — WebSocket, TTL 8h, reconnexion auto
#### ~~U9~~ ✅ Boutons Texte + Sauvegarde grisés en session active
#### ~~U10~~ ✅ Données génériques au premier lancement
#### ~~U12~~ ✅ Bottom sheet mobile : bouton "Fermer" inaccessible avec le clavier ouvert
#### ~~U13~~ ✅ Thème + Nouveau déplacés dans le coin haut-droit du header
#### ~~U14~~ ✅ TTL restant affiché dans l'overlay de partage
#### ~~U15~~ ✅ Menu d'options d'impression
#### ~~U16~~ ✅ Masquer le bouton sauvegarde en session active


### 🟢 Mineurs — Réalisé

#### ~~M1~~ ✅ Thème non sauvegardé dans l'export HTML *(sans objet — U5)*
#### ~~M4~~ ✅ Champs privés par titre (`privateUrl`, `privateNote`)

---

*Documentation mise à jour le 26 mai 2026.*
