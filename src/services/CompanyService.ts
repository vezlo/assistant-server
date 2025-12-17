import { CompanyRepository } from '../storage/CompanyRepository';
import { CompanyAnalytics } from '../types';

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
}

