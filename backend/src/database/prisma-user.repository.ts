import { getPrismaClient } from './prisma.client.js';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface CreateUserData {
  id?: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  isActive?: boolean;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(data: CreateUserData): Promise<UserRecord>;
}

/**
 * Concrete PostgreSQL UserRepository implementation using Prisma ORM.
 */
export class PrismaUserRepository implements UserRepository {
  private prisma = getPrismaClient();

  public async findByEmail(email: string): Promise<UserRecord | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  public async findById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  public async create(data: CreateUserData): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        email: data.email.trim().toLowerCase(),
        name: data.name.trim(),
        passwordHash: data.passwordHash,
        role: data.role,
        isActive: data.isActive ?? true,
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Helper to strip sensitive fields (passwordHash, timestamps) for API responses.
   */
  public static toSafeUser(user: UserRecord): SafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}
