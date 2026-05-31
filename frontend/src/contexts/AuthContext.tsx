import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

interface Profile { id: string; username: string; rating: number; games_played: number; wins: number; losses: number; draws: number; }

interface AuthContextType {
  user: User | null; session: Session | null; profile: Profile | null; loading: boolean;
  signIn: (e: string, p: string) => Promise<{ error: Error | null }>;
  signUp: (e: string, p: string, u: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId: string) {
    const { data } = await api.getMyProfile(userId);
    if (data) setProfile(data as Profile);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session); setUser(session?.user ?? null);
      if (session?.user) { fetchProfile(session.user.id); } else { setProfile(null); }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(email: string, password: string, username: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, username, rating: 1200 });
      if (profileError) return { error: profileError };
    }
    return { error: null };
  }

  async function signOut() { await supabase.auth.signOut(); }

  return <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
