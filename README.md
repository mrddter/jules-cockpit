# jules-cockpit

Jules Telegram Cockpit based on Node.js and TypeScript.

## Database Seeding

To populate the `users_whitelist` table with initial administrators, edit the `scripts/seed_admins.sql` file replacing the placeholder values with actual Telegram IDs.

Then run the script against your D1 database:

### Local Development
```bash
npx wrangler d1 execute DB --local --file=./scripts/seed_admins.sql
```

### Production
```bash
npx wrangler d1 execute DB --remote --file=./scripts/seed_admins.sql
```
