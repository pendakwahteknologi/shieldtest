import 'dotenv/config';
import { db, schema } from '../db/index.js';
import { hashPassword } from '../services/auth.js';

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
  console.error('Usage: tsx create-user-noninteractive.ts <username> <password>');
  process.exit(1);
}

async function main() {
  const passwordHash = await hashPassword(password);
  await db.insert(schema.users).values({ username, passwordHash });
  console.log(`User "${username}" created successfully.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
