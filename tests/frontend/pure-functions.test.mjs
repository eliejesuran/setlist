/**
 * Tests unitaires pour les fonctions pures du frontend (index.html).
 * Les fonctions sont recopiées ici pour les isoler du DOM.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Fonctions copiées verbatim depuis index.html ──────────────────────────────

const parseDur = s => {
  if (!s) return 0;
  const p = s.trim().split(':');
  return p.length === 2 ? (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0) : parseInt(s) || 0;
};

const fmtDur = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// wsRandomId: identique à index.html
function wsRandomId() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// parseImport avec compteur local (remplace le global nextId de index.html)
let _nextId = 100;
function resetIds() { _nextId = 100; }

function parseImport(text) {
  const lines = text.split('\n');
  const imported = [];
  let badgesParsed = null;
  let bandParsed = null, venueParsed = null, printParsed = null;
  let hasItem = false;

  lines.forEach(line => {
    const raw = line.trim();

    if (raw.startsWith('##BADGES:')) {
      badgesParsed = raw.slice(9).split('|').map(s => s.trim()).filter(Boolean);
      return;
    }
    if (raw.startsWith('##BAND:'))  { bandParsed  = raw.slice(7).trim();  return; }
    if (raw.startsWith('##VENUE:')) { venueParsed = raw.slice(8).trim();  return; }
    if (raw.startsWith('##PRINT:')) {
      const opts = raw.slice(8).trim();
      printParsed = {
        timing:  /timing=true/.test(opts),
        artist:  /artist=true/.test(opts),
        comment: /comment=true/.test(opts),
      };
      return;
    }

    if (!raw || raw === '---') {
      const lastItem = imported[imported.length - 1];
      if (hasItem && (!lastItem || lastItem.type !== 'sep'))
        imported.push({ type: 'sep', id: 'sep' + _nextId++, label: '— Pause —' });
      return;
    }

    let core = raw;
    let privateUrl = '', privateNote = '';
    const noteIdx = core.indexOf(' &note: ');
    if (noteIdx !== -1) { privateNote = core.slice(noteIdx + 8).trim(); core = core.slice(0, noteIdx).trim(); }
    const privIdx = core.indexOf(' &privé: ');
    if (privIdx !== -1) { privateUrl = core.slice(privIdx + 9).trim(); core = core.slice(0, privIdx).trim(); }

    const parts   = core.split(/\s*-\s*/).map(s => s.trim()).filter(Boolean);
    const durIdx  = parts.findIndex(p => /^\d+:\d{2}$/.test(p));
    const duration = durIdx !== -1 ? parts[durIdx] : '0:00';
    const songParts = durIdx !== -1 ? parts.filter((_, i) => i !== durIdx) : parts;

    imported.push({
      type: 'song', id: 's' + _nextId++,
      title: songParts[0] || '', artist: songParts[1] || '',
      duration, comment: songParts.slice(2).join(' - '),
      privateUrl, privateNote,
    });
    hasItem = true;
  });

  while (imported.length && imported[imported.length - 1].type === 'sep') imported.pop();

  return { imported, badgesParsed, bandParsed, venueParsed, printParsed };
}

// subBefore avec items en paramètre (remplace le global items de index.html)
function subBefore(items, idx) {
  let sum = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (items[i].type === 'sep') break;
    sum += parseDur(items[i].duration);
  }
  return sum;
}

// ── parseDur ──────────────────────────────────────────────────────────────────

describe('parseDur', () => {
  it('parse le format M:SS standard', () => {
    assert.equal(parseDur('3:45'), 225);
  });

  it('parse la durée zéro', () => {
    assert.equal(parseDur('0:00'), 0);
  });

  it('parse les minutes à deux chiffres', () => {
    assert.equal(parseDur('10:05'), 605);
  });

  it('parse les secondes inférieures à 10', () => {
    assert.equal(parseDur('0:59'), 59);
  });

  it('parse une heure exacte', () => {
    assert.equal(parseDur('60:00'), 3600);
  });

  it('retourne 0 pour une chaîne vide', () => {
    assert.equal(parseDur(''), 0);
  });

  it('retourne 0 pour null', () => {
    assert.equal(parseDur(null), 0);
  });

  it('retourne 0 pour undefined', () => {
    assert.equal(parseDur(undefined), 0);
  });

  it('ignore les espaces autour', () => {
    assert.equal(parseDur('  3:45  '), 225);
  });

  it('retourne 0 pour un format invalide', () => {
    assert.equal(parseDur('invalid'), 0);
  });

  it('retourne 0 pour des caractères non-numériques', () => {
    assert.equal(parseDur('abc:de'), 0);
  });
});

// ── fmtDur ────────────────────────────────────────────────────────────────────

describe('fmtDur', () => {
  it('formate 0 secondes', () => {
    assert.equal(fmtDur(0), '0:00');
  });

  it('formate 225 secondes', () => {
    assert.equal(fmtDur(225), '3:45');
  });

  it('formate 60 secondes exactement', () => {
    assert.equal(fmtDur(60), '1:00');
  });

  it('ajoute le zéro devant les secondes < 10', () => {
    assert.equal(fmtDur(61), '1:01');
  });

  it('formate les grandes valeurs', () => {
    assert.equal(fmtDur(605), '10:05');
  });

  it('formate 59 secondes', () => {
    assert.equal(fmtDur(59), '0:59');
  });
});

// ── Aller-retour parseDur / fmtDur ────────────────────────────────────────────

describe('parseDur / fmtDur — aller-retour', () => {
  const cas = [0, 30, 59, 60, 225, 599, 600, 3600, 3661];
  for (const v of cas) {
    it(`${v}s → "${fmtDur(v)}" → ${v}s`, () => {
      assert.equal(parseDur(fmtDur(v)), v);
    });
  }
});

// ── parseImport ───────────────────────────────────────────────────────────────

describe('parseImport', () => {
  beforeEach(() => resetIds());

  it('parse une chanson avec tous les champs', () => {
    const { imported } = parseImport('Ma Chanson - Mon Artiste - 3:45');
    assert.equal(imported.length, 1);
    const s = imported[0];
    assert.equal(s.type, 'song');
    assert.equal(s.title, 'Ma Chanson');
    assert.equal(s.artist, 'Mon Artiste');
    assert.equal(s.duration, '3:45');
    assert.equal(s.comment, '');
  });

  it('parse une chanson sans timing → durée 0:00', () => {
    const { imported } = parseImport('Ma Chanson - Mon Artiste');
    assert.equal(imported[0].duration, '0:00');
    assert.equal(imported[0].title, 'Ma Chanson');
    assert.equal(imported[0].artist, 'Mon Artiste');
  });

  it('parse un titre seul', () => {
    const { imported } = parseImport('Juste Un Titre');
    assert.equal(imported[0].title, 'Juste Un Titre');
    assert.equal(imported[0].artist, '');
  });

  it('parse une chanson avec titre, artiste, timing et note', () => {
    const { imported } = parseImport('Chanson - Artiste - 4:20 - Note de scène');
    const s = imported[0];
    assert.equal(s.title, 'Chanson');
    assert.equal(s.artist, 'Artiste');
    assert.equal(s.duration, '4:20');
    assert.equal(s.comment, 'Note de scène');
  });

  it('crée un séparateur depuis ---', () => {
    const { imported } = parseImport('Song1 - 3:00\n---\nSong2 - 2:00');
    assert.equal(imported.length, 3);
    assert.equal(imported[0].type, 'song');
    assert.equal(imported[1].type, 'sep');
    assert.equal(imported[2].type, 'song');
  });

  it('crée un séparateur depuis une ligne vide', () => {
    const { imported } = parseImport('Song1 - 3:00\n\nSong2 - 2:00');
    assert.equal(imported.length, 3);
    assert.equal(imported[1].type, 'sep');
  });

  it('ne crée pas de séparateur doublé', () => {
    const { imported } = parseImport('Song1\n\n\n\nSong2');
    assert.equal(imported.filter(i => i.type === 'sep').length, 1);
  });

  it('supprime les séparateurs en fin de liste', () => {
    const { imported } = parseImport('Song1 - 3:00\n---');
    assert.equal(imported.length, 1);
    assert.equal(imported[0].type, 'song');
  });

  it('parse le header ##BADGES:', () => {
    const { badgesParsed } = parseImport('##BADGES: Lieu | Date | Extra\nSong - 1:00');
    assert.deepEqual(badgesParsed, ['Lieu', 'Date', 'Extra']);
  });

  it('parse le header ##BAND:', () => {
    const { bandParsed } = parseImport('##BAND: Mon Groupe\nSong - 1:00');
    assert.equal(bandParsed, 'Mon Groupe');
  });

  it('parse le header ##VENUE:', () => {
    const { venueParsed } = parseImport('##VENUE: Salle Pleyel\nSong - 1:00');
    assert.equal(venueParsed, 'Salle Pleyel');
  });

  it('parse le header ##PRINT:', () => {
    const { printParsed } = parseImport('##PRINT: timing=true artist=false comment=true\nSong - 1:00');
    assert.equal(printParsed.timing,  true);
    assert.equal(printParsed.artist,  false);
    assert.equal(printParsed.comment, true);
  });

  it('parse le champ &privé:', () => {
    const { imported } = parseImport('Chanson &privé: https://youtu.be/abc123');
    assert.equal(imported[0].privateUrl, 'https://youtu.be/abc123');
    assert.equal(imported[0].title, 'Chanson');
  });

  it('parse le champ &note:', () => {
    const { imported } = parseImport('Chanson &note: do bémol à la reprise');
    assert.equal(imported[0].privateNote, 'do bémol à la reprise');
  });

  it('parse les deux champs privés ensemble', () => {
    const { imported } = parseImport('Chanson &privé: https://link.com &note: ma note');
    assert.equal(imported[0].privateUrl, 'https://link.com');
    assert.equal(imported[0].privateNote, 'ma note');
  });

  it('retourne un tableau vide pour une entrée vide', () => {
    const { imported } = parseImport('');
    assert.equal(imported.length, 0);
  });

  it('ignore les lignes de headers sans items', () => {
    const { imported, bandParsed } = parseImport('##BAND: Groupe\n##VENUE: Scène');
    assert.equal(imported.length, 0);
    assert.equal(bandParsed, 'Groupe');
  });

  it('retourne null pour les champs absents', () => {
    const { badgesParsed, bandParsed, venueParsed, printParsed } = parseImport('Song - 1:00');
    assert.equal(badgesParsed, null);
    assert.equal(bandParsed,   null);
    assert.equal(venueParsed,  null);
    assert.equal(printParsed,  null);
  });
});

// ── wsRandomId ────────────────────────────────────────────────────────────────

describe('wsRandomId', () => {
  it('retourne une chaîne de 8 caractères', () => {
    assert.equal(wsRandomId().length, 8);
  });

  it('ne contient que les caractères autorisés', () => {
    // charset : abcdefghijkmnpqrstuvwxyz23456789 (sans l, o, 0, 1)
    const valid = /^[abcdefghijkmnpqrstuvwxyz23456789]+$/;
    for (let i = 0; i < 50; i++) {
      assert.match(wsRandomId(), valid);
    }
  });

  it('génère des IDs différents sur 100 appels', () => {
    const ids = new Set(Array.from({ length: 100 }, wsRandomId));
    assert.ok(ids.size >= 95, `attendu ≥95 IDs uniques, obtenu ${ids.size}`);
  });

  it('ne contient pas les caractères ambigus (l, o, 0, 1)', () => {
    const ambiguous = /[lo01]/;
    for (let i = 0; i < 50; i++) {
      assert.doesNotMatch(wsRandomId(), ambiguous);
    }
  });
});

// ── subBefore ─────────────────────────────────────────────────────────────────

describe('subBefore', () => {
  it('additionne les durées des chansons avant un séparateur', () => {
    const items = [
      { type: 'song', id: 's1', duration: '3:00' },
      { type: 'song', id: 's2', duration: '2:30' },
      { type: 'sep',  id: 'sep1', label: 'Pause' },
    ];
    assert.equal(subBefore(items, 2), 330); // 180 + 150
  });

  it('s\'arrête au séparateur précédent', () => {
    const items = [
      { type: 'song', id: 's1', duration: '1:00' },
      { type: 'sep',  id: 'sep1', label: 'P1' },
      { type: 'song', id: 's2', duration: '2:00' },
      { type: 'song', id: 's3', duration: '3:00' },
      { type: 'sep',  id: 'sep2', label: 'P2' },
    ];
    assert.equal(subBefore(items, 4), 300); // 120 + 180
  });

  it('retourne 0 pour un séparateur en première position', () => {
    const items = [
      { type: 'sep', id: 'sep1', label: 'Intro' },
    ];
    assert.equal(subBefore(items, 0), 0);
  });

  it('traite les durées à 0:00', () => {
    const items = [
      { type: 'song', id: 's1', duration: '0:00' },
      { type: 'song', id: 's2', duration: '0:00' },
      { type: 'sep',  id: 'sep1', label: 'P1' },
    ];
    assert.equal(subBefore(items, 2), 0);
  });
});
