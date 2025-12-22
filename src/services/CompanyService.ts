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

  async getCompany(companyId: string | number) {
    return this.repository.getCompany(companyId);
  }

  async updateCompany(companyId: string | number, company: { response_mode: string }) {
    return this.repository.updateCompany(companyId, company);
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

