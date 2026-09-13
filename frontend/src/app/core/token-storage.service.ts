import { Injectable } from '@angular/core';

const TOKEN_KEY = 'leetcamp_token';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  setToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Navegación privada o storage bloqueado — la sesión simplemente no persiste al recargar.
    }
  }

  clearToken(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // no-op
    }
  }
}
