import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import type { paths } from '../generated/api.d.ts';
import { TokenStorageService } from './token-storage.service';

type RegisterRequest = paths['/api/v1/auth/register']['post']['requestBody']['content']['application/json'];
type RegisterResponse = paths['/api/v1/auth/register']['post']['responses'][201]['content']['application/json'];
type LoginRequest = paths['/api/v1/auth/login']['post']['requestBody']['content']['application/json'];
type LoginResponse = paths['/api/v1/auth/login']['post']['responses'][200]['content']['application/json'];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenStorage = inject(TokenStorageService);

  register(input: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${environment.apiBaseUrl}/auth/register`, input);
  }

  login(input: LoginRequest): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiBaseUrl}/auth/login`, input)
      .pipe(tap((response) => this.tokenStorage.setToken(response.token)));
  }

  logout(): void {
    this.tokenStorage.clearToken();
  }

  isAuthenticated(): boolean {
    return this.tokenStorage.getToken() !== null;
  }
}
