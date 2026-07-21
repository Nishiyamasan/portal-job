'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getLocalizedHomePath } from '@/lib/auth-redirects';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  profileId: string | null;
  role: string | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function authCookieAttributes(maxAge?: number) {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; secure' : '';
  const maxAgeAttribute = typeof maxAge === 'number' ? `; max-age=${maxAge}` : '';
  return `path=/${maxAgeAttribute}; samesite=lax${secure}`;
}

function setAccessTokenCookie(accessToken: string, maxAge = 3600) {
  document.cookie = `sb-access-token=${accessToken}; ${authCookieAttributes(maxAge)}`;
}

function clearAccessTokenCookie() {
  document.cookie = `sb-access-token=; ${authCookieAttributes()}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchProfile = async (accessToken: string) => {
      try {
        let apiUrl = process.env.NEXT_PUBLIC_GO_API_URL || process.env.NEXT_PUBLIC_PUBLIC_READ_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10001';
        if (typeof window === 'undefined') {
          apiUrl = process.env.INTERNAL_GO_API_URL || process.env.INTERNAL_PUBLIC_READ_API_URL || process.env.INTERNAL_API_URL || apiUrl;
        }

        const res = await fetch(`${apiUrl}/api/v1/auth/me`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!res.ok) {
          console.error('Failed to fetch profile status:', res.status);
          return;
        }

        const data = await res.json();
        if (mounted) {
          setProfileId(data.id ?? null);
          setRole(data.role ?? null);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    const syncProfile = async (user: User, accessToken: string) => {
      try {
        let apiUrl = process.env.NEXT_PUBLIC_GO_API_URL || process.env.NEXT_PUBLIC_PUBLIC_READ_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10001';
        if (typeof window === 'undefined') {
          apiUrl = process.env.INTERNAL_GO_API_URL || process.env.INTERNAL_PUBLIC_READ_API_URL || process.env.INTERNAL_API_URL || apiUrl;
        }

        const res = await fetch(`${apiUrl}/api/v1/auth/sync-profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            id: user.id,
            email: user.email,
            display_name: user.user_metadata?.display_name || user.user_metadata?.full_name,
          }),
        });
        if (!res.ok) {
          console.error('Failed to sync profile status:', res.status);
        } else {
          const data = await res.json();
          if (mounted) {
            setProfileId(data.id ?? null);
            if (data.role) {
              setRole(data.role);
            }
          }
        }
      } catch (error) {
        console.error('Failed to sync profile:', error);
      } finally {
        await fetchProfile(accessToken);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user && session.access_token) {
        setAccessTokenCookie(session.access_token, session.expires_in || 3600);
        syncProfile(session.user, session.access_token);
      } else {
        clearAccessTokenCookie();
        setProfileId(null);
        setRole(null);
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user && session.access_token) {
        setAccessTokenCookie(session.access_token, session.expires_in || 3600);
        syncProfile(session.user, session.access_token);
      } else if (event === 'SIGNED_OUT') {
        clearAccessTokenCookie();
        setProfileId(null);
        setRole(null);
        setIsLoading(false);
      } else {
        clearAccessTokenCookie();
        setProfileId(null);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign(getLocalizedHomePath());
  };

  return (
    <AuthContext.Provider value={{ user, session, profileId, role, isLoading, signOut }}>
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
