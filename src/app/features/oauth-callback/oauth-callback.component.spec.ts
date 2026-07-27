import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OauthCallbackComponent } from './oauth-callback.component';
import { AuthService } from '../../core/services/auth.service';
import { Router } from '@angular/router';
import { signal } from '@angular/core';

class MockAuthService {
  user = signal(null);
  initFromToken = vi.fn().mockResolvedValue(undefined);
}

describe('OauthCallbackComponent', () => {
  let component: OauthCallbackComponent;
  let fixture: ComponentFixture<OauthCallbackComponent>;
  let auth: MockAuthService;
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };
  let originalHash: string;

  beforeEach(() => {
    auth = new MockAuthService();
    mockRouter = { navigate: vi.fn().mockResolvedValue(true) };
    sessionStorage.clear();
    // Record and then clear the hash so tests start clean
    originalHash = window.location.hash;
    window.location.hash = '';

    TestBed.configureTestingModule({
      imports: [OauthCallbackComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: mockRouter },
      ],
    });

    fixture = TestBed.createComponent(OauthCallbackComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    window.location.hash = originalHash;
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  describe('token from hash fragment', () => {
    beforeEach(() => {
      window.location.hash = '#token=test-jwt-token-from-hash';
    });

    it('calls window.history.replaceState to clean the URL after extracting token from hash', () => {
      const spy = vi.spyOn(window.history, 'replaceState');
      component.ngOnInit();
      expect(spy).toHaveBeenCalledWith({}, '', window.location.pathname);
    });

    it('stores the token in sessionStorage', () => {
      component.ngOnInit();
      expect(sessionStorage.getItem('token')).toBe('test-jwt-token-from-hash');
    });

    it('calls auth.initFromToken with the extracted token', () => {
      component.ngOnInit();
      expect(auth.initFromToken).toHaveBeenCalledWith('test-jwt-token-from-hash');
    });
  });

  describe('navigation after auth', () => {
    it('navigates to /features-bug after initFromToken resolves', async () => {
      window.location.hash = '#token=test-jwt-token';

      component.ngOnInit();

      // Wait for the promise chain in ngOnInit to complete
      await vi.waitFor(() => {
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/features-bug']);
      });
    });

    it('navigates to /login when no token is found', () => {
      window.location.hash = '';

      component.ngOnInit();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('calls replaceState even when no token is found (URL cleanup)', () => {
      const spy = vi.spyOn(window.history, 'replaceState');
      window.location.hash = '';
      component.ngOnInit();
      expect(spy).toHaveBeenCalled();
    });
  });
});
