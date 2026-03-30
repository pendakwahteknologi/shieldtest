import 'dotenv/config';
import readline from 'node:readline';
import { db, schema } from '../db/index.js';
import { hashPassword } from '../services/auth.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function main() {
  const username = await question('Username: ');
  const password = await question('Password: ');

  if (!username || !password) {
    console.error('Username and password are required.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  await db.insert(schema.users).values({
    username,
    passwordHash,
  });

  console.log(`User "${username}" created successfully.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create user:', err);
  process.exit(1);
});
