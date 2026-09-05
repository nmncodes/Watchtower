import 'dotenv/config';
import { prisma } from '../lib/prisma';

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.log('Usage: npx tsx scripts/set-admin.ts <user-email>');
  process.exit(1);
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User with email "${email}" not found in database.`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { email },
    data: { role: 'ADMIN' },
  });

  console.log(`Successfully promoted ${email} to ADMIN!`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
