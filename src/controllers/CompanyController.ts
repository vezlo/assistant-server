import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { CompanyService } from '../services/CompanyService';
import logger from '../config/logger';

export class CompanyController {
  private companyService: CompanyService;

  constructor(companyService: CompanyService) {
    this.companyService = companyService;
  }


  async getAnalytics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const companyId = req.profile.companyId;
      const analytics = await this.companyService.getAnalytics(companyId);

      res.json(analytics);

    } catch (error) {
      logger.error('Get company analytics error:', error);
      res.status(500).json({
        error: 'Failed to get company analytics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
