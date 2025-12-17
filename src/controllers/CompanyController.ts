import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { CompanyService } from '../services/CompanyService';
import logger from '../config/logger';
import { RESPONSE_MODES } from '../config/responseModes';

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

  async getCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const company = await this.companyService.getCompany(req.profile.companyId);
      res.json(company);
    } catch (error) {
      logger.error('Get company error:', error);
      res.status(500).json({ error: 'Failed to get company' });
    }
  }

  async updateCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const allowedUpdates = ['response_mode'];
      const updates = Object.keys(req.body);

      // Filter out invalid updates
      const validUpdates: Record<string, any> = {};
      updates.forEach((update) => {
        if (allowedUpdates.includes(update)) {
          validUpdates[update] = req.body[update];
        }
      });


      if (validUpdates.response_mode && !Object.values(RESPONSE_MODES).includes(validUpdates.response_mode)) {
         res.status(400).json({ error: 'Invalid response mode' });
         return;
      }

      await this.companyService.updateCompany(req.profile.companyId, validUpdates as { response_mode: string });
      res.json({ success: true });
    } catch (error) {
      logger.error('Update company error:', error);
      res.status(500).json({ error: 'Failed to update company' });
    }
  }
}
