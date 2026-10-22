export type AuthUser = { id: string; email: string; emailVerified: boolean };

export type SignUpMetadata = {
  full_name: string;
  phone: string;
  building_id: string;
  floor: string;
  room: string;
  terms_accepted: "true";
};

export type SignInResult =
  | { ok: true; user: AuthUser }
  | { ok: false; code: "invalid_credentials" | "email_not_confirmed" | "error"; message?: string };

export type TokenType = "signup" | "email" | "recovery" | "email_change";

export interface AuthProvider {
  getUser(): Promise<AuthUser | null>;
  signUp(input: { email: string; password: string; metadata: SignUpMetadata }): Promise<{ ok: true; userId: string } | { ok: false; message: string }>;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  resendVerification(email: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  /** Consume an emailed link. On success the user is signed in. */
  verifyToken(token: string, type: TokenType): Promise<{ ok: true; type: TokenType; user: AuthUser } | { ok: false; message: string }>;
  updatePassword(userId: string, newPassword: string): Promise<void>;
  /** Check a password without touching the current session. */
  checkPassword(email: string, password: string): Promise<boolean>;
  requestEmailChange(userId: string, newEmail: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  /** Seed/admin only: create a confirmed user. */
  createConfirmedUser(input: { email: string; password: string; metadata: SignUpMetadata }): Promise<string>;
}
