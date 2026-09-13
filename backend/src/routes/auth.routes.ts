import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

export function createAuthRouter(controller?: AuthController): Router {
  const router = Router();
  const authController = controller ?? new AuthController();

  router.post('/login', authController.login);
  router.get('/me', authenticate, authController.me);
  router.post('/logout', authController.logout);

  return router;
}
