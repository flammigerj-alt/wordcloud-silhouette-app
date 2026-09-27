#!/usr/bin/env node
/**
 * Kommandozeilenfassung der Prüfung.
 *
 *   node bin/cli.js verdächtig.eml
 *   cat mail.eml | node bin/cli.js
 *   node bin/cli.js mail.eml --json
 *   node bin/cli.js --url beispiel.online [--seite seitentext.txt]
 *   node bin/cli.js --url beispiel.online --abrufen
 *   node bin/cli.js --url beispiel.online --tief     (Browser + KI)
 *
 * Die Mail-Prüfung verschickt keinerlei Daten. Ins Netz geht nur --abrufen,
 * und nur zu der angegebenen Webseite.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { analysiere, analysiereAdresse } from '../src/analyzer.js';
import { ruefeSeiteAb } from '../src/abruf.js';

const ESC = String.fromCharCode(27);
const FARBEN = {
  aus: ESC + '[0m', fett: ESC + '[1m', grau: ESC + '[90m',
  rot: ESC + '[31m', gelb: ESC + '[33m', gruen: ESC + '[32m',
  blau: ESC + '[36m', magenta: ESC + '[35m',
};

const nutzeFarbe = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const f = (farbe, text) => (nutzeFarbe ? `${FARBEN[farbe]}${text}${FARBEN.aus}` : text);

const SCHWERE_STIL = {
  kritisch: { farbe: 'rot', zeichen: '!! ', label: 'KRITISCH' },
  hoch: { farbe: 'rot', zeichen: '!  ', label: 'HOCH' },
  mittel: { farbe: 'gelb', zeichen: '~  ', label: 'MITTEL' },
  niedrig: { farbe: 'blau', zeichen: '.  ', label: 'NIEDRIG' },
  info: { farbe: 'grau', zeichen: 'i  ', label: 'HINWEIS' },
  gut: { farbe: 'gruen', zeichen: '+  ', label: 'UNAUFFÄLLIG' },
};

const STUFEN_FARBE = { rot: 'rot', gelb: 'gelb', gruen: 'gruen' };

function leseEingabe(pfad) {
  if (pfad) return readFileSync(pfad, 'utf8');
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function umbruch(text, breite, einzug) {
  const woerter = String(text).split(/\s+/).filter(Boolean);
  const zeilen = [];
  let zeile = '';
  for (const wort of woerter) {
    if (zeile && `${zeile} ${wort}`.length > breite) {
      zeilen.push(zeile);
      zeile = wort;
    } else {
      zeile = zeile ? `${zeile} ${wort}` : wort;
    }
  }
  if (zeile) zeilen.push(zeile);
  return zeilen.map((z, i) => (i === 0 ? z : einzug + z)).join('\n');
}

function drucke(bericht) {
  const breite = Math.min(process.stdout.columns || 90, 100);
  const linie = '-'.repeat(breite);

  console.log('');
  console.log(f('fett', bericht.art === 'adresse' ? 'WEBSEITEN-PRÜFUNG' : 'PHISHING-PRÜFUNG'));
  console.log(linie);
  console.log(`${f('fett', 'Urteil:')}       ${f(STUFEN_FARBE[bericht.stufe], f('fett', bericht.urteil.name.toUpperCase()))}  (${bericht.punkte}/100 Risikopunkte)`);
  console.log(`${f('fett', 'Aussagekraft:')} ${bericht.sicherheit.stufe}`);
  console.log(f('grau', `  ${umbruch(bericht.sicherheit.text, breite - 2, '  ')}`));
  console.log('');
  console.log(umbruch(bericht.urteil.text, breite, ''));

  if (bericht.art === 'adresse') {
    const a = bericht.adresse;
    console.log('');
    console.log(f('fett', 'Geprüfte Adresse'));
    console.log(`  Eingabe:    ${a.eingabe || '(leer)'}`);
    if (a.domain) console.log(`  Domain:     ${a.domain}`);
    if (a.host && a.host !== a.domain) console.log(`  Host:       ${a.host}`);
    if (a.verschluesselt !== null) {
      console.log(`  Verbindung: ${a.verschluesselt ? 'https' : 'http (unverschlüsselt)'}${a.schemaAngenommen ? ' (angenommen)' : ''}`);
    }
    const r = bericht.abruf;
    if (r) {
      console.log(`  Abruf:      ${r.ok ? `Status ${r.status}` : f('gelb', r.fehler || `Status ${r.status}`)}`);
      if (r.kette.length > 1) {
        for (const k of r.kette) console.log(f('grau', `              ${k.status} ${k.url}`));
      }
    }
  }

  if (bericht.kopf?.istMail) {
    console.log('');
    console.log(f('fett', 'Absender'));
    if (bericht.absender.anzeigename) console.log(`  Angezeigt:  ${bericht.absender.anzeigename}`);
    console.log(`  Adresse:    ${bericht.absender.adresse || '(nicht lesbar)'}`);
    if (bericht.absender.antwortAn) console.log(`  Antwort an: ${bericht.absender.antwortAn}`);
    if (bericht.kopf.betreff) console.log(`  Betreff:    ${bericht.kopf.betreff}`);
  }

  const gruppen = new Map();
  for (const b of bericht.befunde) {
    if (!gruppen.has(b.kategorie)) gruppen.set(b.kategorie, []);
    gruppen.get(b.kategorie).push(b);
  }

  for (const [kategorie, liste] of gruppen) {
    console.log('');
    console.log(f('fett', kategorie));
    console.log(f('grau', linie));
    for (const b of liste) {
      const stil = SCHWERE_STIL[b.schwere] || SCHWERE_STIL.info;
      console.log(`${f(stil.farbe, `${stil.zeichen}[${stil.label}]`)} ${f('fett', b.titel)}`);
      console.log(`     ${umbruch(b.erklaerung, breite - 5, '     ')}`);
      for (const beweis of b.beweis) {
        console.log(f('grau', `     > ${umbruch(beweis, breite - 7, '       ')}`));
      }
      if (b.rat) console.log(f('magenta', `     -> ${umbruch(b.rat, breite - 8, '        ')}`));
      console.log('');
    }
  }

  console.log(f('fett', 'Was du jetzt tun solltest'));
  console.log(f('grau', linie));
  bericht.naechsteSchritte.forEach((schritt, i) => {
    console.log(`  ${i + 1}. ${umbruch(schritt, breite - 5, '     ')}`);
  });
  console.log('');
}

const KI_FARBE = { rot: 'rot', gelb: 'gelb', gruen: 'gruen' };

function druckeTief(ergebnis) {
  const breite = Math.min(process.stdout.columns || 90, 100);
  const linie = '-'.repeat(breite);
  const { ki, erkundung: e } = ergebnis;

  console.log('');
  console.log(f('fett', 'TIEFENPRÜFUNG'));
  console.log(linie);
  console.log(`Adresse:      ${ergebnis.adresse}`);
  if (e.endUrl && e.endUrl !== e.startUrl) console.log(`Gelandet auf: ${e.endUrl}`);
  console.log(`Angesehen:    ${e.seiten.length} Seite(n): ${e.seiten.map((s) => s.rolle).join(', ') || '-'}`);
  console.log(`Videos:       ${e.videos.length ? e.videos.map((v, i) => `${i + 1}) ${v.anbieter || 'direkt'}${v.titel ? ` "${v.titel}"` : ''}, ${v.bilder} Bilder`).join('; ') : 'keine gefunden'}`);
  for (const h of e.hinweise) console.log(f('grau', `              ${h}`));
  if (e.fehler) console.log(f('gelb', `Browser:      ${e.fehler}`));
  console.log('');

  if (ki) {
    console.log(`${f('fett', 'Urteil:')}       ${f(KI_FARBE[ki.stufe], f('fett', ki.name.toUpperCase()))}  (Gewissheit: ${ki.gewissheit})`);
    if (ki.masche && !/^keine/i.test(ki.masche)) console.log(`${f('fett', 'Masche:')}       ${ki.masche}`);
    console.log('');
    console.log(umbruch(ki.zusammenfassung, breite, ''));
    const abschnitt = (titel, zeilen) => {
      if (!zeilen.length) return;
      console.log('');
      console.log(f('fett', titel));
      console.log(f('grau', linie));
      zeilen.forEach((z) => console.log(z));
    };
    const zeichen = { stark: f('rot', '!! '), mittel: f('gelb', '!  '), schwach: f('blau', '.  ') };
    abschnitt('Belege', ki.belege.map((b) => `${zeichen[b.gewicht] || '   '}${umbruch(b.befund, breite - 3, '   ')}\n${f('grau', `   > ${umbruch(b.fundstelle, breite - 5, '     ')}`)}`));
    abschnitt('Was dagegen spricht', ki.entlastend.map((t) => `+  ${umbruch(t, breite - 3, '   ')}`));
    abschnitt('Videos', ki.videos.map((v) => `${f('fett', v.video)}\n   ${umbruch(v.inhalt, breite - 3, '   ')}\n   ${f('magenta', umbruch(`Auffällig: ${v.auffaelligkeiten}`, breite - 3, '   '))}`));
    abschnitt('Selbst nachprüfen', ki.selbst_pruefen.map((t, i) => `  ${i + 1}. ${umbruch(t, breite - 5, '     ')}`));
    abschnitt('Empfehlung', [umbruch(ki.empfehlung, breite, '')]);
    console.log('');
    console.log(f('grau', `Beurteilt von ${ki.modell} anhand von ${ki.bilder} Bildern; ${ki.verbrauch.eingabe} + ${ki.verbrauch.ausgabe} Token.`));
    console.log(f('grau', 'Eine KI kann irren. Das Urteil ersetzt nicht den Blick ins Handelsregister und in die BaFin-Datenbank.'));
  } else {
    console.log(f('gelb', `Kein KI-Urteil: ${ergebnis.kiFehler}`));
    console.log('Es folgt nur das Ergebnis der festen Regeln.');
    drucke(ergebnis.regeln);
    return;
  }

  const r = ergebnis.regeln;
  const wertend = r.befunde.filter((b) => b.gewicht > 0);
  console.log('');
  console.log(f('fett', `Zum Vergleich - feste Regeln: ${r.urteil.name} (${r.punkte}/100)`));
  for (const b of wertend) console.log(f('grau', `  - ${b.titel}`));
  console.log('');
}

async function tief(url, { alsJson, bilderOrdner, ohneKi, modell }) {
  const { tiefenpruefung } = await import('../src/tiefenpruefung.js');
  const ergebnis = await tiefenpruefung(url, {
    ohneKi,
    ki: { modell },
    fortschritt: alsJson ? undefined : (t) => console.error(f('grau', t)),
  });
  if (bilderOrdner) {
    mkdirSync(bilderOrdner, { recursive: true });
    ergebnis.bilder.forEach((b, i) => {
      const name = `${String(i + 1).padStart(2, '0')}-${b.titel.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '')}.jpg`;
      writeFileSync(join(bilderOrdner, name), Buffer.from(b.jpeg, 'base64'));
    });
    if (!alsJson) console.error(f('grau', `${ergebnis.bilder.length} Bilder gespeichert in ${bilderOrdner}`));
  }
  if (alsJson) {
    const { bilder, ...ohneBilder } = ergebnis;
    console.log(JSON.stringify(ohneBilder, null, 2));
  } else {
    druckeTief(ergebnis);
  }
  process.exitCode = { gruen: 0, gelb: 1, rot: 2 }[ergebnis.stufe];
}

async function main() {
  const argumente = process.argv.slice(2);
  if (argumente.includes('--help') || argumente.includes('-h')) {
    console.log([
      '',
      'Prüfung verdächtiger E-Mails - läuft vollständig lokal, ohne Netzwerk.',
      '',
      '  node bin/cli.js <datei.eml>      Datei prüfen',
      '  cat mail.eml | node bin/cli.js   Von der Standardeingabe lesen',
      '  node bin/cli.js <datei> --json   Ergebnis als JSON ausgeben',
      '',
      '  node bin/cli.js --url <adresse>                     Webadresse prüfen',
      '  node bin/cli.js --url <adresse> --seite <datei>     samt kopiertem Seitentext',
      '  node bin/cli.js --url <adresse> --abrufen           Seite abrufen und prüfen',
      '  node bin/cli.js --url <adresse> --tief              Tiefenprüfung: Browser + KI',
      '       --bilder <ordner>   Bildschirmfotos und Video-Einzelbilder dort speichern',
      '       --ohne-ki           nur Browser und Regeln, nichts geht an die KI',
      '       --modell <name>     anderes Claude-Modell (Standard: claude-opus-5)',
      '',
      'Ohne --abrufen wird die Webseite nicht aufgerufen. Mit --abrufen holt das',
      'Werkzeug nur das HTML-Dokument - ohne JavaScript, Cookies und Bilder.',
      'Der Betreiber der Seite sieht dabei deine IP-Adresse, wie bei jedem Besuch.',
      '',
      'Die Tiefenprüfung öffnet die Seite in einem echten Browser, besucht Unterseiten,',
      'macht Bildschirmfotos und zieht Einzelbilder aus Videos. Das alles geht an',
      'Claude (Anthropic), das ein begründetes Urteil schreibt. Braucht ANTHROPIC_API_KEY',
      'und einmalig: npm install && npx playwright install chromium',
      '',
      'Rückgabewert: 0 unauffällig, 1 verdächtig, 2 sehr wahrscheinlich Betrug.',
      'Am aussagekräftigsten ist die Prüfung mit dem vollständigen Original-Header.',
      'Wie du an den kommst, steht in der README.',
      '',
    ].join('\n'));
    return;
  }

  const alsJson = argumente.includes('--json');
  const wert = (schalter) => {
    const i = argumente.indexOf(schalter);
    return i === -1 ? undefined : (argumente[i + 1] ?? '');
  };
  const url = wert('--url');
  const seite = wert('--seite');

  let bericht;
  if (url !== undefined) {
    if (!url.trim() || url.startsWith('-')) {
      console.error('Hinter --url fehlt die Adresse, z. B. --url beispiel.online');
      process.exitCode = 2;
      return;
    }
    let seitentext = '';
    if (seite) {
      try {
        seitentext = readFileSync(seite, 'utf8');
      } catch {
        console.error(`Seitentext nicht lesbar: ${seite}`);
        process.exitCode = 2;
        return;
      }
    }
    if (argumente.includes('--tief')) {
      await tief(url, { alsJson, bilderOrdner: wert('--bilder'), ohneKi: argumente.includes('--ohne-ki'), modell: wert('--modell') });
      return;
    }
    const abruf = argumente.includes('--abrufen') ? await ruefeSeiteAb(url) : null;
    bericht = analysiereAdresse(url, seitentext, abruf);
  } else {
    const pfad = argumente.find((a) => !a.startsWith('-'));
    const roh = leseEingabe(pfad);
    if (!roh.trim()) {
      console.error('Keine Eingabe. Bitte eine Datei angeben oder die Mail über die Standardeingabe hineingeben.');
      process.exitCode = 2;
      return;
    }
    bericht = analysiere(roh);
  }

  if (alsJson) console.log(JSON.stringify(bericht, null, 2));
  else drucke(bericht);

  process.exitCode = { gruen: 0, gelb: 1, rot: 2 }[bericht.stufe];
}

main();
