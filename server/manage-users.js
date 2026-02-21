#!/usr/bin/env node
/**
 * User management CLI for The Stayman Whisperer
 *
 * Usage:
 *   npm run users:add                    # Interactive add
 *   npm run users:add -- -e email -p pass -n name
 *   npm run users:list
 *   npm run users:remove -- -e email
 *   npm run db:init                      # Create tables
 */
import dotenv from 'dotenv';
dotenv.config();

import { createUser, removeUser, listUsers } from './auth.js';
import { initSchema, closePool } from './db.js';
import { createInterface } from 'readline';

const args = process.argv.slice(2);
const command = args[0] || 'help';

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL not set. Add it to your .env file.\n');
    process.exit(1);
  }

  // Ensure tables exist
  await initSchema();

  switch (command) {
    case 'add': {
      let email = getArg('-e');
      let password = getArg('-p');
      let name = getArg('-n');

      if (!email) email = await prompt('Email: ');
      if (!name) name = await prompt('Display name: ');
      if (!password) password = await prompt('Password: ');

      if (!email || !password) {
        console.error('Email and password are required.');
        process.exit(1);
      }

      try {
        const user = await createUser(email, password, name);
        console.log(`\n✓ User created: ${user.name} (${user.email})\n`);
      } catch (err) {
        console.error(`\n✗ ${err.message}\n`);
        process.exit(1);
      }
      break;
    }

    case 'list': {
      const users = await listUsers();
      if (users.length === 0) {
        console.log('\nNo users yet. Add one with: npm run users:add\n');
      } else {
        console.log(`\n♠ The Stayman Whisperer — Users (${users.length}):`);
        console.log('─'.repeat(60));
        users.forEach(u => {
          const date = u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : '';
          console.log(`  ${(u.name || '').padEnd(20)} ${u.email.padEnd(30)} ${date}`);
        });
        console.log('');
      }
      break;
    }

    case 'remove': {
      let email = getArg('-e');
      if (!email) email = await prompt('Email to remove: ');
      if (!email) {
        console.error('Email is required.');
        process.exit(1);
      }

      try {
        await removeUser(email);
        console.log(`\n✓ User ${email} removed.\n`);
      } catch (err) {
        console.error(`\n✗ ${err.message}\n`);
        process.exit(1);
      }
      break;
    }

    case 'help':
    default:
      console.log(`
♠  The Stayman Whisperer — User Management

Commands:
  npm run users:add       Add a new user (interactive)
  npm run users:list      List all users
  npm run users:remove    Remove a user
  npm run db:init         Initialize database tables

Flags (for scripting):
  npm run users:add -- -e user@example.com -p password123 -n "John Doe"
  npm run users:remove -- -e user@example.com

Requires DATABASE_URL in .env
`);
  }

  await closePool();
}

main();
