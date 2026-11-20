import { createContext, useContext } from 'react';
export type User = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'TEACHER';
};
export const AuthContext = createContext<User | null>(null);
export const useAuth = () => useContext(AuthContext)!;
