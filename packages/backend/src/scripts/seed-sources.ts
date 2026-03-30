import 'dotenv/config';
import { db, schema } from '../db/index.js';

const SOURCES = [
  {
    name: 'urlhaus',
    type: 'threat',
    url: 'https://urlhaus.abuse.ch/downloads/csv_recent/',
    refreshIntervalMins: 360,
  },
  {
    name: 'openphish',
    type: 'threat',
    url: 'https://openphish.com/feed.txt',
    refreshIntervalMins: 360,
  },
  {
    name: 'phishtank',
    type: 'threat',
    url: 'https://data.phishtank.com/data/online-valid.json',
    refreshIntervalMins: 720,
  },
  {
    name: 'tranco',
    type: 'clean',
    url: 'https://tranco-list.eu/top-1m.csv.zip',
    refreshIntervalMins: 10080,
  },
  {
    name: 'stevenblack-ads',
    type: 'category',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
    refreshIntervalMins: 10080,
  },
  {
    name: 'stevenblack-adult',
    type: 'category',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn/hosts',
    refreshIntervalMins: 10080,
  },
  {
    name: 'feodo',
    type: 'threat',
    url: 'https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.txt',
    refreshIntervalMins: 360,
  },
  {
    name: 'threatfox',
    type: 'threat',
    url: 'https://threatfox.abuse.ch/export/csv/recent/',
    refreshIntervalMins: 360,
  },
  {
    name: 'coinblocker',
    type: 'category',
    url: 'https://zerodot1.gitlab.io/CoinBlockerLists/list.txt',
    refreshIntervalMins: 10080,
  },
];

async function main() {
  console.log('Seeding sources...');

  for (const source of SOURCES) {
    await db
      .insert(schema.sources)
      .values(source)
      .onConflictDoNothing({ target: schema.sources.name });

    console.log(`  Seeded: ${source.name}`);
  }

  console.log('Sources seeded successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to seed sources:', err);
  process.exit(1);
});
