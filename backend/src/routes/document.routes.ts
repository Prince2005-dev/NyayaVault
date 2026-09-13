import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

export function createDocumentRouter(controller?: DocumentController): Router {
  const router = Router();
  const documentController = controller ?? new DocumentController();

  // All document routes require verified authentication
  router.use(authenticate);

  router.get('/:id', documentController.getById);
  router.get('/:id/download', documentController.download);
  router.get('/:id/versions', documentController.getVersions);
  router.get('/:id/audit', documentController.getAudit);
  router.post('/:id/seal', documentController.seal);
  router.post('/:id/verify', documentController.verify);

  return router;
}
