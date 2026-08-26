# SSBBB — Setlist Tool
**v2026-06-02e** · Elie JESURAN · GPL

## Optimisation des tokens / Comportement Claude 
Parler en optimisant les tokens. · Posez des questions pour optimiser les tokens. · relire le code 2x

## Architecture
`index.html` standalone (HTML/CSS/JS monofichier) · jsPDF 2.5.1 + html2canvas 1.4.1 · Google Fonts CDN  
Serveur : Node 20 + ws · `wss://setlist-21hb.onrender.com` · Render gratuit · UptimeRobot `/healthz` 5min  
Front : Infomaniak `jesuran.be` · PWA `manifest.json` (SetlistTool, icônes 192/512)

## Modèle de données
```js
Song: {type:'song', id:'s42', title, artist, duration:'M:SS', comment, privateUrl, privateNote}
Sep:  {type:'sep',  id:'sep43', label}
SetlistSlot: {id, name, items, headerBadges, bandName, footerVenue, sessionName, savedAt}
// privateUrl/privateNote exclus PDF et export texte
```

## État global
| Var | Rôle |
|---|---|
| `items` | `Song\|Sep[]` ordonnée |
| `headerBadges` | `{id,label}[]` badges header |
| `nextId` / `nextBadgeId` | compteurs ID auto-incrément |
| `currentTheme` | `dark-gold\|sepia\|light-paper` |
| `ws` / `wsSessionId` | WebSocket actif + ID session |
| `wsSuppressPatch` | verrou anti-boucle patch |
| `_wsLastModified` | timestamp ms dernière modif locale |
| `_wsPendingState` | patch reçu différé (saisie active) |
| `_wsKnownNames` / `_wsMyLastSentName` | noms pairs + mon dernier nom envoyé |
| `_themeManualOverride` | inhibe le suivi OS theme si true |
| `_undoStack` | pile snapshots complets (max 20) |
| `_currentSlotId` | ID slot actif dans `ssbbb_setlists_v2` |

## localStorage
`ssbbb_setlists_v2` → `{current: id, setlists: SetlistSlot[]}` · autosave debounce 3s  
Migration auto depuis `ssbbb_setlist_v1` au premier chargement.  
**Multi-setlist commenté** — `slCreate/slSwitch/slDelete/slRename/slRenderList` + boutons toolbar/overlay hors service.  
`slGetAll()` / `lsSave()` / `lsLoad()` restent actifs (slot unique courant). Réactivation en cours sur la branche `feat/multi-setlist`.  
**Autosave** : `renderList()` (structure) + `input` délégué sur tout champ (hors `#texte-ov`, `#setlists-ov`, code/nom de pair) + flush sur `visibilitychange:hidden`.

## Thèmes
Cycle `dark-gold`→`sepia`→`light-paper` · suit `prefers-color-scheme` sauf `_themeManualOverride`  
PDF : JPEG qualité 0.92 · scale ×1.5 (dark) / ×2 (light) · fond selon thème · nom `{band}_{badges}_{mode}.pdf`

## WS Collaboration

### Invariants à ne pas casser
- `onopen` → `identify{name}` **uniquement** — jamais `wsPatch()` ici (éviterait d'écraser l'état serveur avant `init`)
- `joined` (session vide) → `wsPatch()` pour initialiser le serveur avec l'état local
- `init` (session existante) → `wsApplyState(state, true)` ; si distant < local → appliquer + toast undo
- `patch` reçu → ignoré si `lastModified < _wsLastModified` (anti-ping-pong) ; différé si saisie active → appliqué au `focusout`
- `btn-new-session` → reset setlist locale (confirm + WS disconnect + toast undo 4s) — ne crée plus de slot
- `wsConnect` = `wss://` (pas `https://` : SyntaxError sur Safari ancien) · heartbeat `ping` 30s (`_wsPingTimer`)
- `onclose` code **1008** (refus serveur : session pleine / URL invalide) → pas de reconnexion
- `{type:'error'}` reçu → toast + `wsDisconnect()` si `SESSION_FULL`
- Champs vides : appliquer `state.bandName`/`footerVenue` si `!== undefined` (sinon fuite entre slots)
- PDF : tout texte utilisateur passe par `esc()` avant `tgt.innerHTML`
- Export texte : slot artiste toujours présent (`Titre -  - 3:45 - Note`) · parser conserve slots vides internes · split `/\s-\s/` (espace obligatoire de chaque côté — protège les titres à trait d'union)
- Séparateur exporté `--- Étiquette ---` (étiquette perdue avant) · `---` ou ligne vide → `— Pause —`
- Note privée : retours à la ligne encodés `\n` à l'export, restitués à l'import (sinon morceaux fantômes)
- `wsPatch()` horodate `_wsLastModified` **avant** le test de socket — sinon les modifs hors ligne ne sont pas datées et l'état serveur les écrase sans toast à la reconnexion
- Toast « Version distante chargée » seulement si `items.length` (rien à annuler sur une setlist vide)
- `canNativeShare()` = `navigator.share` **+** touch détecté — ne pas afficher le bouton 📤 sur desktop

### Messages
| Direction | Type | Contenu |
|---|---|---|
| c→s | `patch` | `{state}` avec `lastModified`, `sessionName` |
| c→s | `identify` | `{name}` |
| s→c | `init` | `{state, names[], sessionName, peers}` — session existante |
| s→c | `joined` | `{names[], sessionName, peers}` — session vide |
| s→c | `peer_joined\|peer_left\|peers_update` | `{names[], peers}` |
| s→c | `session_expired` | → `wsDisconnect()` + toast |
| c↔s | `ping/pong` | heartbeat |

## Fonctions clés
**Rendu** `renderList()` · `renderBadges(skipPatch?)` · `makeSong(song,num)` · `makeSep(sep,idx)` · `syncFooter()`  
**Données** `addSong(d)` · `addSep(lbl)` · `parseDur(s)` · `fmtDur(s)` · `updateTotals()` · `subBefore(idx)` · `refreshSubs()`  
**Undo** `pushUndo()` · `undoLast()` · `captureState()`  
**Storage** `lsSave()` · `lsLoad()` · `slGetAll()` · ~~`slSwitch`~~ · ~~`slCreate`~~ · ~~`slDelete`~~ · ~~`slRename`~~ · ~~`slRenderList`~~ (commentés)  
**PDF** `buildPdfHtml(mode)` · `generatePDF()`  
**Import/Export texte** `exportImportFormat()` · `parseImport(text)`  
**Sheet mobile** `openSheet(song)` · `closeSheet()`  
**Helpers** `mob()` (≤640px ou touch) · `canNativeShare()` (share + touch) · `showToast(msg,undoFn)` · `scheduleAutoSave()`  
**WS** `wsConnect(id)` · `wsDisconnect()` · `wsPatch()` · `wsApplyState(state,isInit?)` · `_doApplyState(state)` · `wsDoConnect()` · `wsValidateCode(raw)` · `wsRandomId()` · `wsUpdateShareUI()` · `wsUpdatePeersList(names,count)` · `wsUpdateToolbarLabel()` · `wsUpdateTtl()`

## Tests
`node --test "tests/*.test.mjs"` (16) · `/tests/front` (41) · `/tests/collab` (15, exige `PORT=3099 RATE_LIMIT_MAX=1000 node server/server.js`).
Détails, pièges et limites assumées du format texte : [tests/README.md](tests/README.md).

## Backlog actif
**New features** F1 Enregistrer ses setlists (branche `feat/multi-setlist`) · F2 Avoir l'ensemble d'un répertoire enregistré, et pouvoir simplement cocher pour mettre dans une setlist.
**Moyen** U23 Minuteur concert (chrono setlist) · U24 Import texte libre intelligent · U25 Notes globales setlist · U18 Gestion avancée sessions WS  
**Confort** U26 Raccourcis clavier (Enter/↑↓/Del) · U27 Thème persisté localStorage · U28 Compteur titres par bloc · U29 Recherche/filtre 
**Mineur** U30 Export CSV · U31 Swipe supprimer séparateurs  
**PDF** U32 Option qualité haute/basse dans le panneau Options PDF — haute : scale×2 qualité 0.95 · basse : scale×1 qualité 0.80 · checkbox `pdf-quality-high` → pilote `SCALE` et `imgQuality` dans `generatePDF()`

## Bugs connus non corrigés
- **Rejoindre une session WS écrase la setlist locale** : `init` → `_doApplyState` → `renderList()` → autosave 3 s dans le slot courant. Sans confirmation ni undo. Piste : suspendre l'autosave tant que `ws` est OPEN, ou dédier un slot à la session.
- **Arbitrage par `Date.now()` local** (`wsApplyState`) : horloges désynchronisées entre appareils → l'appareil « en avance » gagne toujours. Le serveur envoie déjà `timestamp` dans le broadcast (inutilisé). Piste : compteur de version ou horloge serveur.
- Pas de service worker : « fonctionne hors ligne » (overlay partage) est faux, jsPDF/html2canvas/fonts viennent du CDN.
- Serveur : pas de `isAlive`/`terminate` → pairs fantômes dans la liste après une coupure brutale.

---
*Màj 25 août 2026 — passe de correction de bugs*
