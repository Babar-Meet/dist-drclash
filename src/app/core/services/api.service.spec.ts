import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    TestBed.configureTestingModule({
      providers: [ApiService],
    });
    service = TestBed.inject(ApiService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  describe('vote()', () => {
    it('should POST to /api/vote with the correct body', async () => {
      const mockResponse = { upvotes: 42, user_vote: 1 };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.vote(123, 1);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/vote'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_id: 123, value: 1 }),
        }),
      );
      expect(result).toEqual({ upvotes: 42, user_vote: 1 });
    });

    it('should include auth token in Authorization header when token exists in sessionStorage', async () => {
      sessionStorage.setItem('token', 'test-jwt-token');
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ upvotes: 10, user_vote: 1 }),
      });

      await service.vote(1, 1);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-jwt-token',
          }),
        }),
      );
    });

    it('should throw an error when the API responds with non-ok status', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Vote failed', code: 'VOTE_FAILED' }),
      });

      await expect(service.vote(1, 1)).rejects.toThrow('Vote failed');
    });
  });
});
