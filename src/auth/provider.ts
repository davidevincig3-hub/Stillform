export interface AuthProvider {
  getUser(): Promise<{ id: string; mode: 'demo' | 'authenticated' } | null>;
  signOut(): Promise<void>;
}
export const demoAuth: AuthProvider = {
  async getUser() {
    return { id: 'demo-user', mode: 'demo' };
  },
  async signOut() {},
};
