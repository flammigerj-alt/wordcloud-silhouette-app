/**
 * Baut aus den ES-Modulen unter src/ eine einzige, in sich geschlossene
 * HTML-Datei. Noetig, weil Module ueber file:// nicht geladen werden duerfen -
 * und weil die Pruefung ohne Server und ohne Netzwerk laufen soll.
 *
 * Kein externer Bundler: die verwendete Teilmenge von ES-Modulen ist klein
 * genug, um sie hier sauber selbst aufzuloesen.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = dirname(fileURLToPath(import.meta.url));

/** Reihenfolge entspricht den Abhaengigkeiten - von unten nach oben. */
const MODULE = [
  'src/data.js',
  'src/parse-eml.js',
  'src/utils.js',
  'src/rules/header.js',
  'src/rules/links.js',
  'src/rules/content.js',
  'src/rules/attachments.js',
  'src/analyzer.js',
];

const raumname = (pfad) => `__M_${pfad.replace(/^src\//, '').replace(/[^a-z0-9]/gi, '_')}`;

/** Zielpfad eines relativen Imports auf einen Modulnamen aus MODULE abbilden. */
function loeseAuf(vonPfad, ziel) {
  const absolut = resolve(dirname(resolve(WURZEL, vonPfad)), ziel);
  const rel = relative(WURZEL, absolut).split('\\').join('/');
  if (!MODULE.includes(rel)) throw new Error(`Unbekanntes Modul: ${ziel} (aus ${vonPfad})`);
  return rel;
}

function umschliesse(pfad) {
  const quelle = readFileSync(resolve(WURZEL, pfad), 'utf8');
  const exporte = new Set();
  const einbindungen = [];

  let koerper = quelle
    // import { a, b } from './x.js';  ->  const { a, b } = __M_x;
    .replace(/^\s*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm, (_, namen, ziel) => {
      einbindungen.push(`  const {${namen.trim()}} = ${raumname(loeseAuf(pfad, ziel))};`);
      return '';
    })
    // Nackte Imports gibt es hier nicht, aber sicherheitshalber entfernen.
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');

  koerper = koerper.replace(/^export\s+(async\s+)?(const|let|function|class)\s+([A-Za-z0-9_$]+)/gm,
    (_, asyn, art, name) => {
      exporte.add(name);
      return `${asyn || ''}${art} ${name}`;
    });

  if (/^export\s/m.test(koerper)) {
    throw new Error(`Nicht unterstuetzte export-Form in ${pfad}`);
  }

  return [
    `// ----- ${pfad} -----`,
    `const ${raumname(pfad)} = (() => {`,
    ...einbindungen,
    koerper.replace(/^/gm, '  ').replace(/\s+$/, ''),
    `  return { ${[...exporte].join(', ')} };`,
    '})();',
    '',
  ].join('\n');
}

const gebuendelt = MODULE.map(umschliesse).join('\n');
const zugang = `const { analysiere, STUFEN, SCHWEREN } = ${raumname('src/analyzer.js')};`;

const vorlage = readFileSync(resolve(WURZEL, 'web/vorlage.html'), 'utf8');
const beispiel = readFileSync(resolve(WURZEL, 'beispiele/phishing-bank.eml'), 'utf8');

const kern = `${gebuendelt}\n${zugang}\n`;
const beispielJs = `const BEISPIEL_MAIL = ${JSON.stringify(beispiel)};\n`;

const seite = vorlage
  .replace('/* __PRUEFKERN__ */', () => kern)
  .replace('/* __BEISPIEL__ */', () => beispielJs);

if (seite.includes('__PRUEFKERN__') || seite.includes('__BEISPIEL__')) {
  throw new Error('Platzhalter in der Vorlage nicht ersetzt');
}

mkdirSync(resolve(WURZEL, 'dist'), { recursive: true });

// Fassung zum Veroeffentlichen als Artifact: ohne eigenes Dokumentgeruest.
writeFileSync(resolve(WURZEL, 'dist/artifact.html'), seite, 'utf8');

// Fassung zum lokalen Oeffnen per Doppelklick: vollstaendiges HTML-Dokument.
const eigenstaendig = [
  '<!doctype html>',
  '<html lang="de">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '</head>',
  '<body>',
  seite,
  '</body>',
  '</html>',
  '',
].join('\n');
writeFileSync(resolve(WURZEL, 'dist/phishing-check.html'), eigenstaendig, 'utf8');

const kb = (t) => `${Math.round(t.length / 1024)} KB`;
console.log(`dist/phishing-check.html  ${kb(eigenstaendig)}  (eigenstaendig, per Doppelklick zu oeffnen)`);
console.log(`dist/artifact.html        ${kb(seite)}  (Fassung zum Veroeffentlichen)`);
