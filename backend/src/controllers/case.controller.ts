import type { Request, Response, NextFunction } from 'express';
import { PrismaCaseRepository, type CaseRepository } from '../database/case.repository.js';
import { PrismaUserRepository, type UserRepository } from '../database/prisma-user.repository.js';
import { CaseAuthorizationService } from '../services/case-authorization.service.js';
import {
  CaseNotFoundError,
  CaseAccessDeniedError,
  InvalidCaseRequestError,
  CaseMemberAlreadyExistsError,
  UserNotFoundError,
} from '../errors/domain.errors.js';

export class CaseController {
  constructor(
    private caseRepo: CaseRepository = new PrismaCaseRepository(),
    private userRepo: UserRepository = new PrismaUserRepository()
  ) {}

  /**
   * POST /api/cases
   *
   * Creates a new case matter and assigns creator as LEAD member in a transaction.
   *
   * Security:
   * - Caller identity is strictly bound to req.user.id.
   * - Any caller-supplied createdBy / ownerId / actorId is completely ignored.
   */
  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const { title, firNumber, description, department, policeStation, classification, status, caseNumber } =
        req.body || {};

      if (!title || typeof title !== 'string' || title.trim().length < 3) {
        throw new InvalidCaseRequestError('Case title must be at least 3 characters.');
      }

      if (!firNumber || typeof firNumber !== 'string' || firNumber.trim().length === 0) {
        throw new InvalidCaseRequestError('FIR number is required.');
      }

      // Mandatory Security Rule: createdBy comes ONLY from req.user.id
      const creatorId = req.user.id;

      const createdCase = await this.caseRepo.createCaseWithCreator(
        {
          caseNumber: typeof caseNumber === 'string' ? caseNumber : undefined,
          firNumber,
          title,
          description: typeof description === 'string' ? description : undefined,
          department: typeof department === 'string' ? department : undefined,
          policeStation: typeof policeStation === 'string' ? policeStation : undefined,
          classification: typeof classification === 'string' ? classification : undefined,
          status: typeof status === 'string' ? status : undefined,
        },
        creatorId
      );

      res.status(201).json(PrismaCaseRepository.toCaseResponse(createdCase));
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/cases
   *
   * Retrieves cases for the authenticated user, enforcing database-level authorization.
   */
  public list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const { search, status, classification } = req.query;
      const isAdmin = req.user.role === 'ADMIN';

      const cases = await this.caseRepo.listForUser(req.user.id, isAdmin, {
        search: typeof search === 'string' ? search : undefined,
        status: typeof status === 'string' ? status : undefined,
        classification: typeof classification === 'string' ? classification : undefined,
      });

      res.status(200).json(cases.map(PrismaCaseRepository.toCaseResponse));
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/cases/:id
   *
   * Retrieves case details if authorized.
   *
   * Security:
   * - Authorizes before returning protected case data.
   * - Returns 404 for inaccessible cases to eliminate case enumeration.
   */
  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const { id } = req.params;
      if (!id || typeof id !== 'string') {
        throw new InvalidCaseRequestError('Case ID is required.');
      }

      // Check authorization before returning case data
      const isAuthorized = await CaseAuthorizationService.canAccessCase(
        req.user,
        id,
        this.caseRepo
      );

      if (!isAuthorized) {
        // Inaccessible case policy: 404 to avoid case enumeration
        throw new CaseNotFoundError(id);
      }

      const caseRecord = await this.caseRepo.findById(id);
      if (!caseRecord) {
        throw new CaseNotFoundError(id);
      }

      res.status(200).json(PrismaCaseRepository.toCaseResponse(caseRecord));
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/cases/:id/members
   *
   * Adds an explicit member to a case matter.
   *
   * Security:
   * - Restricted to ADMIN and case creator.
   * - Target userId identifies the user being added; caller identity remains req.user.id.
   */
  public addMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const { id } = req.params;
      const { userId, role } = req.body || {};

      if (!id || typeof id !== 'string') {
        throw new InvalidCaseRequestError('Case ID is required.');
      }

      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        throw new InvalidCaseRequestError('Target userId is required.');
      }

      // 1. Authorize caller: ADMIN or case creator
      const canManage = await CaseAuthorizationService.canManageMembers(
        req.user,
        id,
        this.caseRepo
      );

      if (!canManage) {
        throw new CaseAccessDeniedError(id);
      }

      // 2. Verify target case exists
      const targetCase = await this.caseRepo.findById(id);
      if (!targetCase) {
        throw new CaseNotFoundError(id);
      }

      // 3. Verify target user exists
      const targetUser = await this.userRepo.findById(userId.trim());
      if (!targetUser) {
        throw new UserNotFoundError(userId.trim());
      }

      // 4. Verify user is not already a member
      const alreadyMember = await this.caseRepo.isMember(id, userId.trim());
      if (alreadyMember) {
        throw new CaseMemberAlreadyExistsError(id, userId.trim());
      }

      // 5. Add member
      const member = await this.caseRepo.addMember(
        id,
        userId.trim(),
        typeof role === 'string' ? role.trim() : 'MEMBER'
      );

      res.status(201).json({
        success: true,
        member,
      });
    } catch (err) {
      next(err);
    }
  };
}
