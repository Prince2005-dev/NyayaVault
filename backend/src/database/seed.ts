import { getPrismaClient } from './prisma.client.js';
import { PasswordService } from '../services/password.service.js';

export const DEV_DEFAULT_PASSWORD = 'Password@123';

export const SEED_USERS = [
  {
    id: 'usr_001',
    name: 'Inspector Sharma',
    email: 'inspector@nyayavault.local',
    role: 'INSPECTOR',
  },
  {
    id: 'usr_002',
    name: 'Dr. A. Verma',
    email: 'forensic@nyayavault.local',
    role: 'FORENSIC_OFFICER',
  },
  {
    id: 'usr_003',
    name: 'Auditor K. Patel',
    email: 'auditor@nyayavault.local',
    role: 'AUDITOR',
  },
  {
    id: 'usr_000',
    name: 'System Administrator',
    email: 'admin@nyayavault.local',
    role: 'ADMIN',
  },
];

/**
 * Seeds initial demo/development users into the PostgreSQL database.
 *
 * Security:
 * - Deterministic development accounts only.
 * - Passwords are strictly hashed with Argon2id before storage.
 * - Idempotent upsert logic to allow safe re-execution.
 */
export async function seedUsers(password: string = DEV_DEFAULT_PASSWORD): Promise<void> {
  const prisma = getPrismaClient();
  const passwordHash = await PasswordService.hashPassword(password);

  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        passwordHash,
        isActive: true,
      },
      create: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
        isActive: true,
      },
    });
  }
}

// Auto-run if invoked directly
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('seed.js') || process.argv[1].endsWith('seed.ts'));

if (isMain) {
  seedUsers()
    .then(() => {
      console.log('Successfully seeded development users.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to seed users:', err);
      process.exit(1);
    });
}
