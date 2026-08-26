# Tests

Deux batteries complémentaires, sans dépendance à installer.

## Serveur — `tests/server.test.mjs`

```bash
node --test "tests/*.test.mjs"
```

16 tests. Chacun démarre un serveur isolé sur un port libre, en sous-processus.
Les limites (`MAX_PEERS`, `MAX_SESSIONS`, `RATE_LIMIT_MAX`, `SESSION_TTL_MS`) sont
surchargées par variables d'environnement pour tester les cas limites sans attendre
ni saturer le rate limiter — les valeurs par défaut du serveur restent inchangées.

`ws` est résolu depuis `server/node_modules` : lancer `npm install` dans `server/`
au préalable si le dossier est vide.

## Front — `tests/front.html`

À servir en HTTP (le protocole `file://` interdit l'accès au contenu de l'iframe) :

```bash
npx serve -p 3000 .
```

puis ouvrir <http://localhost:3000/tests/front.html>. Le compteur en haut de page
donne le résultat ; les échecs affichent la valeur attendue et la valeur reçue.

29 tests. La page charge le **vrai** `index.html` dans une iframe et appelle ses
fonctions réelles — aucune copie du code, aucun stub de DOM : une régression dans
`index.html` casse le test.

Deux points de mécanique :

- les `const`/`let` de haut niveau d'un script classique ne sont pas des propriétés
  de `window`. Un pont (`__T`) est injecté dans l'iframe après chargement pour y
  accéder en lecture et en écriture ;
- les tests WebSocket remplacent `WebSocket` dans l'iframe par une socket simulée.
  Aucun test ne touche au réseau.

Les tests qui portent sur une fonctionnalité absente de la branche courante
(le multi-setlist sur `main`) se signalent « ignoré » au lieu d'échouer.

## Couverture connue et angles morts

Testé : formats de durée, parsing/export texte et aller-retour, pagination et
échappement du PDF (avec mesure DOM réelle du débordement), persistance
localStorage et migration v1, annulation, protocole WebSocket des deux côtés.

Non testé : le rendu visuel (thèmes, mise en page mobile), la génération PDF
elle-même (jsPDF/html2canvas, dépendances CDN), le glisser-déposer et le swipe,
`MAX_PEERS` au-delà de la valeur surchargée, et la tenue en charge du serveur.
