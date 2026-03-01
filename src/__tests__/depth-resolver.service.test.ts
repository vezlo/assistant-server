import { DepthResolverService } from '../services/depth-resolver.service';

// Mock Supabase client
function createMockSupabase(overrides: Record<string, any> = {}) {
  const chainable = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  };

  return {
    from: jest.fn().mockReturnValue(chainable),
    _chain: chainable,
    ...overrides,
  } as any;
}

describe('DepthResolverService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.DEVELOPER_MODE;
    delete process.env.TECHNICAL_DEPTH_DEFAULT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('priority 1: per-request parameter', () => {
    it('uses requestDepth when provided and valid', async () => {
      const supabase = createMockSupabase();
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        requestDepth: 4,
        companyUuid: 'test-company-uuid',
      });

      expect(depth).toBe(4);
      // Should not call supabase at all
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it.each([1, 2, 3, 4, 5])('accepts valid depth %i', async (level) => {
      const supabase = createMockSupabase();
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        requestDepth: level,
        companyUuid: 'test-company-uuid',
      });

      expect(depth).toBe(level);
    });

    it('ignores invalid requestDepth (0) and falls through', async () => {
      const supabase = createMockSupabase();
      const chainable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      supabase.from = jest.fn().mockReturnValue(chainable);
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        requestDepth: 0,
        companyUuid: 'test-company-uuid',
      });

      // Should fall through to default (3)
      expect(depth).toBe(3);
    });

    it('ignores invalid requestDepth (6) and falls through', async () => {
      const supabase = createMockSupabase();
      const chainable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      supabase.from = jest.fn().mockReturnValue(chainable);
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        requestDepth: 6,
        companyUuid: 'test-company-uuid',
      });

      expect(depth).toBe(3);
    });

    it('ignores non-integer requestDepth (3.5) and falls through', async () => {
      const supabase = createMockSupabase();
      const chainable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      supabase.from = jest.fn().mockReturnValue(chainable);
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        requestDepth: 3.5,
        companyUuid: 'test-company-uuid',
      });

      expect(depth).toBe(3);
    });
  });

  describe('priority 2: per-conversation setting', () => {
    it('uses conversation technical_depth when set', async () => {
      const chainable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn()
          .mockResolvedValueOnce({ data: { technical_depth: 2 }, error: null }) // conversation query
          .mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      const supabase = { from: jest.fn().mockReturnValue(chainable) } as any;
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        conversationUuid: 'conv-uuid',
        companyUuid: 'test-company-uuid',
      });

      expect(depth).toBe(2);
    });

    it('skips conversation when technical_depth is null', async () => {
      let callCount = 0;
      const chainable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // Conversation query - null depth
            return Promise.resolve({ data: { technical_depth: null }, error: null });
          }
          // All subsequent queries - not found
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        }),
      };
      const supabase = { from: jest.fn().mockReturnValue(chainable) } as any;
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        conversationUuid: 'conv-uuid',
        companyUuid: 'test-company-uuid',
      });

      // Falls through to default
      expect(depth).toBe(3);
    });
  });

  describe('priority 3: company AI settings', () => {
    it('uses company technical_depth from AI settings', async () => {
      let callCount = 0;
      const chainable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // Company ID lookup
            return Promise.resolve({ data: { id: 1 }, error: null });
          }
          if (callCount === 2) {
            // AI settings query
            return Promise.resolve({ data: { technical_depth: 4 }, error: null });
          }
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        }),
      };
      const supabase = { from: jest.fn().mockReturnValue(chainable) } as any;
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        companyUuid: 'test-company-uuid',
      });

      expect(depth).toBe(4);
    });
  });

  describe('priority 4: DEVELOPER_MODE fallback', () => {
    it('maps DEVELOPER_MODE=true to depth 5', async () => {
      process.env.DEVELOPER_MODE = 'true';
      const chainable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      const supabase = { from: jest.fn().mockReturnValue(chainable) } as any;
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        companyUuid: 'test-company-uuid',
      });

      expect(depth).toBe(5);
    });

    it('maps DEVELOPER_MODE=false to depth 2', async () => {
      process.env.DEVELOPER_MODE = 'false';
      const chainable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      const supabase = { from: jest.fn().mockReturnValue(chainable) } as any;
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        companyUuid: 'test-company-uuid',
      });

      expect(depth).toBe(2);
    });
  });

  describe('priority 5: global default', () => {
    it('defaults to 3 when nothing is configured', async () => {
      const chainable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      const supabase = { from: jest.fn().mockReturnValue(chainable) } as any;
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        companyUuid: 'test-company-uuid',
      });

      expect(depth).toBe(3);
    });
  });

  describe('error handling', () => {
    it('falls through gracefully when conversation query fails', async () => {
      const chainable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockRejectedValueOnce(new Error('DB error'))
          .mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      const supabase = { from: jest.fn().mockReturnValue(chainable) } as any;
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        conversationUuid: 'conv-uuid',
        companyUuid: 'test-company-uuid',
      });

      // Falls through to default
      expect(depth).toBe(3);
    });

    it('falls through gracefully when company query fails', async () => {
      const chainable = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockRejectedValue(new Error('DB error')),
      };
      const supabase = { from: jest.fn().mockReturnValue(chainable) } as any;
      const resolver = new DepthResolverService(supabase);

      const depth = await resolver.resolveDepth({
        companyUuid: 'test-company-uuid',
      });

      // Falls through to default
      expect(depth).toBe(3);
    });
  });
});
