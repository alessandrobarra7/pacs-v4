import { createContext, useContext, ReactNode } from 'react';
import { trpc } from '@/lib/trpc';

interface User {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: 'admin_master' | 'unit_admin' | 'medico' | 'viewer';
  unit_id: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}

interface AuthContextType {
  user: User | null | undefined;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  return (
    <AuthContext.Provider value={{ user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
