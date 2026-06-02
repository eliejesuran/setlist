# SSBBB — Setlist Tool
**v2026-06-02b** · Elie JESURAN · GPL · `index.html` standalone + `server.js` WS

## Stack
- Client : HTML/CSS/JS monofichier, localStorage, CDN jsPDF 2.5.1 + html2canvas 1.4.1 + Google Fonts (Bebas Neue, Space Mono)
- Serveur : Node 20 + ws · Render (gratuit) · `wss://setlist-21hb.onrender.com` · keep-alive UptimeRobot `/healthz` 5min
- Front hébergé : Infomaniak `jesuran.be`

## État global JS
| Var | Type | Rôle |
|---|---|---|
| `items` | `Song\|Sep[]` | Liste ordonnée |
| `headerBadges` | `{id,label}[]` | Badges header |
| `nextId/nextBadgeId` | number | Compteurs ID |
| `currentTheme` | string | `dark-gold`\|`sepia`\|`light-paper` |
| `ws/wsSessionId` | WS\|null | Session WS active |
| `wsSuppressPatch` | bool | Verrou anti-boucle patch |
| `_wsLastModified` | number | Timestamp live de la dernière modif locale (ms) |
| `_wsPendingState` | object\|null | Patch reçu mis en attente pendant la saisie active |
| `WS_ID_RE` | RegExp | Regex de validation d'ID de session `[a-zA-Z0-9-]{4,20}` |

## Structures données
```js
Song: {type:'song', id:'s42', title, artist, duration:'M:SS', comment, privateUrl, privateNote}
Sep:  {type:'sep',  id:'sep43', label}
```
`privateUrl`/`privateNote` → exclus PDF et export texte.

## Fonctionnalités clés
| # | Feature | Notes |
|---|---|---|
| 1 | Édition inline | titre/artiste/comment/durée directs dans la liste |
| 2 | Durées | `parseDur()` M:SS, `updateTotals()`, `subBefore(idx)` par bloc |
| 3 | localStorage | clé `ssbbb_setlist_v1`, autosave debounce 15s, restore au load |
| 4 | Export texte | `##BAND/VENUE/PRINT/BADGES:` + lignes `Titre - Artiste - dur - note &privé: url &note: txt` |
| 5 | PDF | mode auto selon thème (dark→PNG×1.5, light→JPEG×2), pagination, options timing/artiste/comment/privés |
| 6 | Thèmes | cycle dark-gold→sepia→light-paper, bouton coin header |
| 7 | Mobile | <640px : sheet (6 champs), boutons ▲▼, pas d'artiste/comment inline |
| 8 | WS collab | patch = état complet + `lastModified` + `sessionName`, reconnexion backoff 2→30s, TTL 8h, indicateur couleur toolbar |
| 9 | Champs privés | privateUrl (icône 🔗 dans liste) + privateNote via sheet |
| 10 | Codes courts | ID lisibles type `jazz-42` générés par `wsRandomId()` |
| 11 | Membres connectés | Noms affichés via `identify`/`peers_update` dans l'overlay partage |
| 12 | Nom de session | Champ partagé via patch WS (`sessionName`), stocké côté serveur |

## Protocole WS
`patch`(c→s) · `init/joined/peer_joined/peer_left/session_expired`(s→c) · `ping/pong`

### Logique de sync (côté client)
- `ws.onopen` → envoie `identify{name}` ; ne PAS envoyer `wsPatch()` (évite d'écraser l'état serveur avant de recevoir `init`)
- `joined` (session vide) → `wsPatch()` pour initialiser le serveur avec l'état local
- `init` (session existante) → `wsApplyState(state, true)` ; si `state.lastModified < _wsLastModified`, toast undo
- `patch` reçu → ignoré si `state.lastModified < _wsLastModified` (anti-ping-pong) ; différé si saisie active (`_wsPendingState`), appliqué au `focusout`
- `wsPatch()` met à jour `_wsLastModified = Date.now()` avant d'envoyer
- `identify` → déclenche `peers_update` (serveur) → `wsUpdatePeersList()` côté client
- Re-identify automatique quand le champ nom change en cours de session

### Protocole serveur — messages
| Message | Direction | Contenu |
|---|---|---|
| `patch` | c→s | `{state}` dont `lastModified`, `sessionName` |
| `identify` | c→s | `{name}` |
| `init` | s→c | `{state, names[], sessionName, peers}` |
| `joined` | s→c | `{names[], sessionName, peers}` (session vide) |
| `peer_joined/left` | s→c | `{names[], peers}` |
| `peers_update` | s→c | `{names[], peers}` |
| `ping/pong` | c↔s | heartbeat |

## PDF
- Nommage : `setlist_{slugBadges}_{mode}.pdf`
- ⚠️ R3 : `buildPdfHtml` utilise `headerBadges[0]` et `[1]` en dur
- `dark-gold` → dark (fond noir, PNG ×1.5) · `sepia`/`light-paper` → light (fond blanc, JPEG ×2)

## localStorage payload
`{items, headerBadges, bandName, footerVenue, savedAt}`

## Fonctions principales
| Fonction | Rôle |
|---|---|
| `renderList()` | Re-rend tout depuis `items[]` |
| `renderBadges(skipPatch?)` | Re-rend badges header |
| `makeSong(song,num)` / `makeSep(sep,idx)` | Crée DOM |
| `addSong(d)` / `addSep(lbl)` | Ajoute item |
| `updateTotals()` / `subBefore(idx)` / `refreshSubs()` | Durées |
| `syncFooter()` | Sync footer ↔ header |
| `buildPdfHtml(mode)` / `generatePDF()` | Export PDF |
| `exportImportFormat()` / `parseImport(text)` | Texte |
| `lsSave()` / `lsLoad()` | localStorage |
| `applyTheme(key)` | CSS vars |
| `openSheet(song)` / `closeSheet()` | Bottom sheet |
| `wsConnect(id)` / `wsDisconnect()` | WS session |
| `wsPatch()` / `wsApplyState(state,isInit?)` | Sync état WS (met à jour `_wsLastModified`) |
| `_doApplyState(state)` | Application effective d'un état distant (appelé par `wsApplyState`) |
| `wsUpdatePeersList(names,count)` | Met à jour l'affichage des membres connectés |
| `wsJoinByCode()` | Rejoindre une session par code court saisi manuellement |
| `wsRandomId()` | Génère un code lisible type `jazz-42` |
| `wsUpdateTtl()` / `wsUpdateShareUI()` | UI session |

---

## Backlog actif

### 🟠 Robustesse
- **R2** — autosave debounce 15s → réduire à 2-3s

### 🟡 UX
- **U18** — Gestion des sessions (suppression, quota)

### ✅ Livrés
- **U17** — ~~Liste des membres connectés~~ → `identify`/`peers_update`, noms affichés dans l'overlay
- **U19** — ~~Rejoindre par code + nommer la session~~ → codes `jazz-42`, champ nom partagé via WS
- **M2** — ~~Nom du groupe absent du slug PDF~~ → `{band}_{badges}_{mode}.pdf`
- **M3/R3** — ~~`footer-badge2` / `buildPdfHtml` en dur sur `[1]`~~ → dernier badge dynamique
- **B10** — ~~Badges non populés chez le pair qui reçoit le lien~~ → `wsPatch()` retiré de `onopen`
- **B8** — ~~Modifs offline écrasées à la reconnexion WS~~ → comparaison `lastModified` + toast undo
- **B-ping-pong** — ~~Deux sessions s'écrasent mutuellement~~ → patches plus vieux ignorés ; patches différés pendant saisie active

---
*Màj 2 juin 2026 (b)*
