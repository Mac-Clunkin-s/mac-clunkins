#!/usr/bin/env node
// Translation coverage per locale.
//
//   node scripts/i18n-report.mjs                 print a table
//   node scripts/i18n-report.mjs --strict        exit 1 if any locale has a key that en lacks
//   node scripts/i18n-report.mjs --min=50        exit 1 if any non-en locale is below 50% coverage
//   node scripts/i18n-report.mjs --missing=zu    also list the keys zu still needs
//   node scripts/i18n-report.mjs --json          machine-readable output
//
// Reads src/i18n/locales/<locale>.json and every src/i18n/<locale>.<namespace>.json, the same
// files src/i18n/index.ts merges at runtime.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n');
const LOCALES = ['en', 'zu', 'st', 'tn'];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

function load(locale) {
  const files = [];
  const base = join(root, 'locales', `${locale}.json`);
  files.push(base);
  for (const name of readdirSync(root)) {
    const parts = name.split('.');
    if (parts.length === 3 && parts[0] === locale && parts[2] === 'json') files.push(join(root, name));
  }
  const merged = {};
  for (const file of files) {
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      console.error(`Cannot read ${file}: ${error.message}`);
      process.exit(2);
    }
    Object.assign(merged, data);
  }
  return merged;
}

const catalogues = Object.fromEntries(LOCALES.map((l) => [l, load(l)]));
const enKeys = Object.keys(catalogues.en);

const rows = LOCALES.map((locale) => {
  const keys = Object.keys(catalogues[locale]);
  const translated = enKeys.filter((k) => typeof catalogues[locale][k] === 'string' && catalogues[locale][k].trim() !== '');
  const missing = enKeys.filter((k) => !translated.includes(k));
  const orphans = keys.filter((k) => !(k in catalogues.en));
  return {
    locale,
    total: enKeys.length,
    translated: translated.length,
    coverage: enKeys.length ? Math.round((translated.length / enKeys.length) * 1000) / 10 : 100,
    missing,
    orphans,
  };
});

if (flag('json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log('locale  translated/total  coverage  orphans');
  for (const r of rows) {
    console.log(
      `${r.locale.padEnd(6)}  ${`${r.translated}/${r.total}`.padEnd(16)}  ${`${r.coverage}%`.padEnd(8)}  ${r.orphans.length}`,
    );
  }
  const want = value('missing');
  if (want) {
    const row = rows.find((r) => r.locale === want);
    if (!row) {
      console.error(`Unknown locale "${want}"`);
      process.exit(2);
    }
    console.log(`\nKeys ${want} still needs (${row.missing.length}):`);
    for (const k of row.missing) console.log(`  ${k}`);
  }
  for (const r of rows.filter((x) => x.orphans.length)) {
    console.log(`\n${r.locale} has keys that en does not define:`);
    for (const k of r.orphans) console.log(`  ${k}`);
  }
}

let failed = false;
if (flag('strict') && rows.some((r) => r.orphans.length)) {
  console.error('\nFAIL: a locale defines keys that en does not.');
  failed = true;
}
const min = value('min');
if (min !== undefined) {
  const low = rows.filter((r) => r.locale !== 'en' && r.coverage < Number(min));
  if (low.length) {
    console.error(`\nFAIL: below ${min}% coverage: ${low.map((r) => r.locale).join(', ')}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
