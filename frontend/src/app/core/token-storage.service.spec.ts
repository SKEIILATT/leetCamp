import { TokenStorageService } from './token-storage.service';

describe('TokenStorageService', () => {
  let service: TokenStorageService;

  beforeEach(() => {
    localStorage.clear();
    service = new TokenStorageService();
  });

  it('returns null when nothing has been stored', () => {
    expect(service.getToken()).toBeNull();
  });

  it('round-trips a token through set/get', () => {
    service.setToken('abc.def.ghi');

    expect(service.getToken()).toBe('abc.def.ghi');
  });

  it('clears the token', () => {
    service.setToken('abc.def.ghi');

    service.clearToken();

    expect(service.getToken()).toBeNull();
  });
});
