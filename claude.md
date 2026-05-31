# SSBBB — Setlist Tool
**v2026-05-27** · Elie JESURAN · GPL · `index.html` standalone + `server.js` WS

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
| 8 | WS collab | patch = état complet, reconnexion 5s, TTL 8h, indicateur couleur toolbar |
| 9 | Champs privés | privateUrl (icône 🔗 dans liste) + privateNote via sheet |

## Protocole WS
`patch`(c→s) · `init/joined/peer_joined/peer_left/session_expired`(s→c) · `ping/pong`

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
| `wsPatch()` / `wsApplyState(state)` | Sync état WS |
| `wsUpdateTtl()` / `wsUpdateShareUI()` | UI session |

---

## Backlog actif

### 🟠 Robustesse
- **R2** — autosave debounce 15s → réduire à 2-3s
- **R3** — `buildPdfHtml` utilise `headerBadges[0/1]` en dur → utiliser venue + dernier badge

### 🟡 UX
- **U17** — Liste des membres connectés à la session
- **U18** — Gestion des sessions (suppression, quota)
- **U19** — Rejoindre par code + nommer la session

### 🟢 Mineurs
- **M2** — Nom du groupe absent du slug PDF
- **M3** — `footer-badge2` pas mis à jour à la suppression d'un badge

### ⚠️ À retester
- **B8** — Modifs offline écrasées à la reconnexion WS
- **B10** — Badges non populés chez le pair qui reçoit le lien (sans modif préalable de l'hôte)

---
*Màj 31 mai 2026*
