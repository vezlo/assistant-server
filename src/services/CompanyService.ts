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
}

