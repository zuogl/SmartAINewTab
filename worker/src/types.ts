export interface GoogleClaims {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}
