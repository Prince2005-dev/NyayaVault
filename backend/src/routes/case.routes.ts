import { Router } from 'express';
import { CaseController } from '../controllers/case.controller.js';
import { DocumentController } from '../controllers/document.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { documentUploadMiddleware } from '../middleware/upload.middleware.js';

export function createCaseRouter(
  controller?: CaseController,
  docController?: DocumentController
): Router {
  const router = Router();
  const caseController = controller ?? new CaseController();
  const documentController = docController ?? new DocumentController();

  // All case routes require verified authentication
  router.use(authenticate);

  router.post('/', caseController.create);
  router.get('/', caseController.list);
  router.get('/:id', caseController.getById);
  router.post('/:id/members', caseController.addMember);
  router.get('/:caseId/documents', documentController.listByCase);
  router.post('/:caseId/documents', documentUploadMiddleware, documentController.upload);

  return router;
}

