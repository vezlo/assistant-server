import { CompanyRepository } from '../storage/CompanyRepository';
import { CompanyAnalytics, CompanyAISettings } from '../types';

export class CompanyService {
  private repository: CompanyRepository;

  constructor(repository: CompanyRepository) {
    this.repository = repository;
  }

  /**
   * Get analytics for a specific company
   */
  async getAnalytics(companyId: string | number): Promise<CompanyAnalytics> {
    return this.repository.getAnalytics(companyId);
  }

  /**
   * Get AI settings for a company
   */
  async getAISettings(companyId: string | number): Promise<CompanyAISettings | null> {
    return this.repository.getAISettings(companyId);
  }

  /**
   * Update AI settings for a company
   */
  async updateAISettings(companyId: string | number, settings: CompanyAISettings): Promise<CompanyAISettings> {
    return this.repository.updateAISettings(companyId, settings);
  }
}

