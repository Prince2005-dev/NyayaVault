import { getPrismaClient } from './prisma.client.js';

export interface CreateCaseData {
  caseNumber?: string;
  firNumber: string;
  title: string;
  description?: string;
  department?: string;
  policeStation?: string;
  classification?: string;
  status?: string;
}

export interface CaseFilters {
  search?: string;
  status?: string;
  classification?: string;
}

export interface CaseRecord {
  id: string;
  caseNumber: string;
  firNumber: string;
  title: string;
  description: string | null;
  department: string;
  policeStation: string;
  classification: string;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  creator: {
    id: string;
    name: string;
    email: string;
  };
  documentCount?: number;
}

export interface CaseMemberRecord {
  id: string;
  caseId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

export interface CaseResponse {
  id: string;
  caseNumber: string;
  firNumber: string;
  title: string;
  description?: string;
  department: string;
  policeStation: string;
  investigatingOfficer: {
    id: string;
    name: string;
  };
  classification: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  documentCount?: number;
}

export interface CaseRepository {
  createCaseWithCreator(data: CreateCaseData, creatorId: string): Promise<CaseRecord>;
  findById(caseId: string): Promise<CaseRecord | null>;
  listForUser(userId: string, isAdmin: boolean, filters?: CaseFilters): Promise<CaseRecord[]>;
  addMember(caseId: string, userId: string, role?: string): Promise<CaseMemberRecord>;
  isMember(caseId: string, userId: string): Promise<boolean>;
  getCreatorId(caseId: string): Promise<string | null>;
}

/**
 * Concrete PostgreSQL CaseRepository implementation using Prisma ORM.
 */
export class PrismaCaseRepository implements CaseRepository {
  private prisma = getPrismaClient();

  public async createCaseWithCreator(data: CreateCaseData, creatorId: string): Promise<CaseRecord> {
    const generatedCaseNumber =
      data.caseNumber?.trim() ||
      `CASE-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    return await this.prisma.$transaction(async (tx) => {
      const createdCase = await tx.case.create({
        data: {
          caseNumber: generatedCaseNumber,
          firNumber: data.firNumber.trim(),
          title: data.title.trim(),
          description: data.description?.trim() || null,
          department: data.department?.trim() || 'Central Legal Division',
          policeStation: data.policeStation?.trim() || 'Central Station',
          classification: data.classification?.trim() || 'CONFIDENTIAL',
          status: data.status?.trim() || 'ACTIVE',
          createdBy: creatorId,
        },
        include: {
          creator: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Creator automatically receives membership as LEAD
      await tx.caseMember.create({
        data: {
          caseId: createdCase.id,
          userId: creatorId,
          role: 'LEAD',
        },
      });

      return {
        ...createdCase,
        documentCount: 0,
      };
    });
  }

  public async findById(caseId: string): Promise<CaseRecord | null> {
    const record = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { documents: true },
        },
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      caseNumber: record.caseNumber,
      firNumber: record.firNumber,
      title: record.title,
      description: record.description,
      department: record.department,
      policeStation: record.policeStation,
      classification: record.classification,
      status: record.status,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      creator: record.creator,
      documentCount: record._count.documents,
    };
  }

  public async listForUser(
    userId: string,
    isAdmin: boolean,
    filters?: CaseFilters
  ): Promise<CaseRecord[]> {
    const whereClause: Record<string, unknown> = {};

    // Non-admin callers only receive cases where they possess explicit membership
    if (!isAdmin) {
      whereClause.members = {
        some: { userId },
      };
    }

    if (filters?.status && filters.status !== 'ALL') {
      whereClause.status = filters.status;
    }

    if (filters?.classification && filters.classification !== 'ALL') {
      whereClause.classification = filters.classification;
    }

    if (filters?.search && filters.search.trim().length > 0) {
      const q = filters.search.trim();
      whereClause.OR = [
        { caseNumber: { contains: q, mode: 'insensitive' } },
        { firNumber: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
      ];
    }

    const records = await this.prisma.case.findMany({
      where: whereClause,
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { documents: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) => ({
      id: record.id,
      caseNumber: record.caseNumber,
      firNumber: record.firNumber,
      title: record.title,
      description: record.description,
      department: record.department,
      policeStation: record.policeStation,
      classification: record.classification,
      status: record.status,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      creator: record.creator,
      documentCount: record._count.documents,
    }));
  }

  public async addMember(caseId: string, userId: string, role = 'MEMBER'): Promise<CaseMemberRecord> {
    const member = await this.prisma.caseMember.create({
      data: {
        caseId,
        userId,
        role,
      },
    });

    return {
      id: member.id,
      caseId: member.caseId,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
    };
  }

  public async isMember(caseId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.caseMember.findUnique({
      where: {
        caseId_userId: {
          caseId,
          userId,
        },
      },
    });

    return member !== null;
  }

  public async getCreatorId(caseId: string): Promise<string | null> {
    const c = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { createdBy: true },
    });
    return c?.createdBy ?? null;
  }

  /**
   * Serializes a CaseRecord to the exact shape expected by the frontend client.
   */
  public static toCaseResponse(record: CaseRecord): CaseResponse {
    return {
      id: record.id,
      caseNumber: record.caseNumber,
      firNumber: record.firNumber,
      title: record.title,
      description: record.description ?? undefined,
      department: record.department,
      policeStation: record.policeStation,
      investigatingOfficer: {
        id: record.creator.id,
        name: record.creator.name,
      },
      classification: record.classification,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      documentCount: record.documentCount ?? 0,
    };
  }
}
