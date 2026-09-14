import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let tokenStorage: TokenStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    tokenStorage = TestBed.inject(TokenStorageService);
    tokenStorage.clearToken();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts to /auth/login and stores the returned token', () => {
    let received: { token: string; expiresAt: string } | undefined;

    service.login({ email: 'ana@bootcamp.edu', password: 'secret123' }).subscribe((response) => {
      received = response;
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'ana@bootcamp.edu', password: 'secret123' });

    req.flush({ token: 'jwt-token', expiresAt: '2026-09-15T00:00:00.000Z' });

    expect(received?.token).toBe('jwt-token');
    expect(tokenStorage.getToken()).toBe('jwt-token');
  });

  it('posts to /auth/register without touching stored token state', () => {
    service
      .register({ email: 'ana@bootcamp.edu', password: 'secret123', displayName: 'Ana' })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/register`);
    expect(req.request.method).toBe('POST');
    req.flush({ userId: 'user-1' });

    expect(tokenStorage.getToken()).toBeNull();
  });

  it('isAuthenticated reflects whether a token is stored', () => {
    expect(service.isAuthenticated()).toBe(false);

    tokenStorage.setToken('jwt-token');

    expect(service.isAuthenticated()).toBe(true);
  });

  it('logout clears the stored token', () => {
    tokenStorage.setToken('jwt-token');

    service.logout();

    expect(service.isAuthenticated()).toBe(false);
  });

  it('posts to /auth/request-password-reset', () => {
    service.requestPasswordReset({ email: 'ana@bootcamp.edu' }).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/request-password-reset`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'ok' });
  });

  it('posts to /auth/reset-password', () => {
    service.resetPassword({ token: 'raw-token', newPassword: 'new-secret123' }).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/reset-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'raw-token', newPassword: 'new-secret123' });
    req.flush({ message: 'ok' });
  });
});
