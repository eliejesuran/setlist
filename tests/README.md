# Tests

Trois batteries complémentaires, sans dépendance à installer.

| Suite | Fichier | Lancement | Tests |
|---|---|---|---|
| Serveur | `server.test.mjs` | `node --test "tests/*.test.mjs"` | 16 |
| Front | `front.html` | navigateur, `/tests/front` | 41 |
| Collaboratif | `collab.html` | navigateur + serveur local, `/tests/collab` | 15 |

## Serveur

```bash
node --test "tests/*.test.mjs"
```

Chaque test démarre un serveur isolé sur un port libre, en sous-processus. Les limites
(`MAX_PEERS`, `MAX_SESSIONS`, `RATE_LIMIT_MAX`, `SESSION_TTL_MS`) sont surchargées par
variables d'environnement pour éprouver les cas limites sans attendre ni saturer le rate
limiter — les valeurs par défaut du serveur restent inchangées.

`ws` est résolu depuis `server/node_modules` : y lancer `npm install` si le dossier est vide.

## Front et collaboratif (navigateur)

```bash
npx serve -p 3000 .
```

- **Front** : <http://localhost:3000/tests/front>
- **Collaboratif** : lancer d'abord le serveur de test, puis <http://localhost:3000/tests/collab>

```bash
PORT=3099 RATE_LIMIT_MAX=1000 node server/server.js
```

Les deux pages chargent le **vrai** `index.html` dans des iframes et appellent ses fonctions
réelles : aucune copie du code, aucun stub de DOM. La suite collaborative va plus loin —
chaque iframe est un client complet, relié par une vraie WebSocket à un vrai serveur ; seule
l'adresse cible est réécrite vers `127.0.0.1`.

`?seul=<fragment>` ne rejoue que les tests dont le groupe ou le nom contient le fragment
(`/tests/collab?seul=coupure`). Utile pour itérer.

### Trois pièges à connaître

1. **Garder l'onglet au premier plan.** Un onglet masqué voit ses minuteurs bridés
   (25 ms → 1 s, puis 1 par minute au-delà de 5 minutes masqué). Les tests de reconnexion
   échouent alors sans que l'application soit en cause — c'est ce qui explique les faux
   négatifs si la suite tourne dans un onglet d'arrière-plan.
2. **`serve` fait des « clean URLs »** : `/tests/collab.html?x=y` est redirigé vers
   `/tests/collab` **et la query string est perdue**. Utiliser l'URL sans `.html`.
3. **Les iframes partagent le `localStorage` de l'origine.** Chaque scène collaborative le
   vide avant de démarrer, sinon un client neuf repart avec la setlist du test précédent.

### Mécanique interne

- Les `const`/`let` de haut niveau d'un script classique ne sont pas des propriétés de
  `window` : un pont (`__T`) est injecté dans chaque iframe après chargement pour y accéder
  en lecture et en écriture.
- La coupure réseau est simulée en fermant la socket et en dirigeant les tentatives suivantes
  vers un port fermé — le client voit exactement ce qu'il verrait sans réseau. Le nombre de
  tentatives en échec est gardé bas : les navigateurs brident les handshakes répétés.
- Les toasts durent 4 s : les tests interceptent `showToast` à la source plutôt que de scruter
  le DOM, pour ne pas dépendre des minuteurs.
- `window.__client`, `window.__scene` et `?manuel=1` permettent de rejouer un scénario à la
  main depuis la console.

## Limites connues du format texte (verrouillées par des tests)

Ces comportements sont **assumés** et testés tels quels — un test échouera s'ils changent :

- un titre contenant «  -  » (espace-tiret-espace) est relu comme deux champs ; un tiret collé
  (`Non-Stop`) est préservé ;
- «  &note:  » ou «  &privé:  » écrits dans une note de scène servent de délimiteur et
  basculent la fin de ligne en champ privé ;
- «  |  » dans une étiquette de badge la découpe en deux badges.

Accents, emoji, guillemets, esperluettes, chevrons, apostrophes, notes privées multilignes et
étiquettes de séparateur font en revanche un aller-retour exact.

## Couverture et angles morts

Couvert : formats de durée, parsing et aller-retour de l'export texte (y compris caractères
spéciaux et setlist de 20 morceaux), pagination et échappement du PDF (débordement mesuré dans
le DOM réel), persistance localStorage et migration v1, annulation, protocole WebSocket des deux
côtés, et — pour le collaboratif — propagation à plusieurs pairs, intégrité des métadonnées,
listes de 20 morceaux, coupures réseau des deux côtés, éditions concurrentes, arrivée tardive.

Non couvert : rendu visuel (thèmes, mise en page mobile), génération PDF elle-même
(jsPDF/html2canvas, dépendances CDN), glisser-déposer et swipe, tenue en charge du serveur,
et le comportement au-delà de 3 pairs simultanés.
