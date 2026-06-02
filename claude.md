# SSBBB — Setlist Tool
**v2026-06-02d** · Elie JESURAN · GPL

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

## Thèmes
Cycle `dark-gold`→`sepia`→`light-paper` · suit `prefers-color-scheme` sauf `_themeManualOverride`  
PDF : `dark-gold` → PNG ×1.5 fond noir · `sepia`/`light-paper` → JPEG ×2 fond blanc · nom `{band}_{badges}_{mode}.pdf`

## WS Collaboration

### Invariants à ne pas casser
- `onopen` → `identify{name}` **uniquement** — jamais `wsPatch()` ici (éviterait d'écraser l'état serveur avant `init`)
- `joined` (session vide) → `wsPatch()` pour initialiser le serveur avec l'état local
- `init` (session existante) → `wsApplyState(state, true)` ; si distant < local → appliquer + toast undo
- `patch` reçu → ignoré si `lastModified < _wsLastModified` (anti-ping-pong) ; différé si saisie active → appliqué au `focusout`
- `slCreate` / `slDelete(slot actif)` → `wsDisconnect()` avant tout changement d'état (sinon broadcast état vide aux pairs)
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
**Storage** `lsSave()` · `lsLoad()` · `slGetAll()` · `slSwitch(id)` · `slCreate(name)` · `slDelete(id)` · `slRename(id,name)` · `slRenderList()`  
**PDF** `buildPdfHtml(mode)` · `generatePDF()`  
**Import/Export texte** `exportImportFormat()` · `parseImport(text)`  
**Sheet mobile** `openSheet(song)` · `closeSheet()`  
**Helpers** `mob()` (≤640px ou touch) · `canNativeShare()` (share + touch) · `showToast(msg,undoFn)` · `scheduleAutoSave()`  
**WS** `wsConnect(id)` · `wsDisconnect()` · `wsPatch()` · `wsApplyState(state,isInit?)` · `_doApplyState(state)` · `wsDoConnect()` · `wsValidateCode(raw)` · `wsRandomId()` · `wsUpdateShareUI()` · `wsUpdatePeersList(names,count)` · `wsUpdateToolbarLabel()` · `wsUpdateTtl()`

## Backlog actif
**Moyen** U23 Minuteur concert (chrono setlist) · U24 Import texte libre intelligent · U25 Notes globales setlist · U18 Gestion avancée sessions WS  
**Confort** U26 Raccourcis clavier (Enter/↑↓/Del) · U27 Thème persisté localStorage · U28 Compteur titres par bloc · U29 Recherche/filtre  
**Mineur** U30 Export CSV · U31 Swipe supprimer séparateurs

---
*Màj 2 juin 2026 (d)*
