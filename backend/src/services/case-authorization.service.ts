import type { CaseRepository } from '../database/case.repository.js';

export interface AuthUserContext {
  id: string;
  role: string;
}

/**
 * Service centralizing case-level authorization policies and boundaries.
 *
 * Security Principles:
 * - Case membership is the PRIMARY authorization boundary for non-admin roles (INSPECTOR, FORENSIC_OFFICER, AUDITOR).
 * - ADMIN possesses an explicit, documented global case-access override.
 * - Global roles alone never grant automatic access to every case.
 * - Case membership management is restricted to ADMIN and the original case creator.
 */
export class CaseAuthorizationService {
  /**
   * Determines if an authenticated user is authorized to access a specific case.
   *
   * @param user - Authenticated caller identity from verified JWT.
   * @param caseId - Target case ID.
   * @param caseRepo - Case repository for membership queries.
   * @returns Promise<boolean> indicating authorization status.
   */
  public static async canAccessCase(
    user: AuthUserContext,
    caseId: string,
    caseRepo: CaseRepository
  ): Promise<boolean> {
    // 1. Explicit ADMIN global override
    if (user.role === 'ADMIN') {
      return true;
    }

    // 2. Primary Boundary: Explicit Case Membership
    return await caseRepo.isMember(caseId, user.id);
  }

  /**
   * Determines if an authenticated user is authorized to manage case memberships.
   *
   * @param user - Authenticated caller identity from verified JWT.
   * @param caseId - Target case ID.
   * @param caseRepo - Case repository for creator/membership queries.
   * @returns Promise<boolean> indicating membership-management authority.
   */
  public static async canManageMembers(
    user: AuthUserContext,
    caseId: string,
    caseRepo: CaseRepository
  ): Promise<boolean> {
    // 1. ADMIN has unrestricted membership-management authority
    if (user.role === 'ADMIN') {
      return true;
    }

    // 2. Case creator has membership-management authority
    const creatorId = await caseRepo.getCreatorId(caseId);
    if (creatorId !== null && creatorId === user.id) {
      return true;
    }

    // Ordinary members do not have membership management authority
    return false;
  }
}
