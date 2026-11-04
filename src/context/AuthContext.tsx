import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

interface AuthUser {
  email: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConfigured: boolean;
  connectionError: string | null;
  retryConnection: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; retryAfter?: number }>;
  setup: (email: string, password: string, setupToken?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_HINT_KEY = 'amit_touch_session_active';
const USER_CACHE_KEY = 'amit_touch_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const savedUser = sessionStorage.getItem(USER_CACHE_KEY);
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_HINT_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    try {
      // If we don't have an active session hint, we must show loading until status check completes
      return sessionStorage.getItem(SESSION_HINT_KEY) !== 'true';
    } catch {
      return true;
    }
  });

  const [isConfigured, setIsConfigured] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', {
        headers: { 'Accept': 'application/json' },
      });

      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      if (res.ok) {
        const data = await res.json();
        setIsConfigured(Boolean(data.isConfigured));
        const authenticated = Boolean(data.isAuthenticated ?? data.authenticated);

        if (authenticated) {
          setIsAuthenticated(true);
          sessionStorage.setItem(SESSION_HINT_KEY, 'true');
          if (data.user) {
            setUser(data.user);
            sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.user));
          }
          setConnectionError(null);
        } else {
          // Explicitly unauthenticated (server confirms session is invalid/absent)
          setIsAuthenticated(false);
          setUser(null);
          sessionStorage.removeItem(SESSION_HINT_KEY);
          sessionStorage.removeItem(USER_CACHE_KEY);
          setConnectionError(null);
        }
      } else if (res.status === 401) {
        // Server explicitly rejected session (401 Unauthorized)
        setIsAuthenticated(false);
        setUser(null);
        sessionStorage.removeItem(SESSION_HINT_KEY);
        sessionStorage.removeItem(USER_CACHE_KEY);
        setConnectionError(null);
      } else {
        // 5xx server error: temporary backend hiccup or restart
        console.warn(`Temporary server status error (${res.status}) during auth status check`);
        setConnectionError('תקלת שרת זמנית. המערכת שומרת על מצב העבודה ומנסה להתחבר מחדש...');
        // Schedule auto retry without reloading
        retryTimeoutRef.current = setTimeout(() => {
          checkAuthStatus();
        }, 4000);
      }
    } catch (err) {
      console.warn('Network error checking auth status:', err);
      // Temporary network failure / server restarting
      // Do NOT log out if user was previously signed in!
      setConnectionError('תקלת תקשורת זמנית עם השרת. המערכת מנסה להתחבר מחדש באופן אוטומטי...');
      retryTimeoutRef.current = setTimeout(() => {
        checkAuthStatus();
      }, 4000);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [checkAuthStatus]);

  const retryConnection = useCallback(async () => {
    setConnectionError('בודק חיבור מחדש...');
    await checkAuthStatus();
  }, [checkAuthStatus]);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        const authedUser = data.user || { email, role: 'owner' };
        setIsAuthenticated(true);
        setUser(authedUser);
        sessionStorage.setItem(SESSION_HINT_KEY, 'true');
        sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(authedUser));
        setConnectionError(null);
        return { success: true };
      }

      if (res.status === 429) {
        return {
          success: false,
          error: data.error || 'יותר מדי ניסיונות שגויים. החשבון ננעל זמנית ל-15 דקות.',
          retryAfter: data.retryAfter || 900,
        };
      }

      return {
        success: false,
        error: data.error || 'פרטי התחברות שגויים',
      };
    } catch (err) {
      console.error('Login error:', err);
      return {
        success: false,
        error: 'שגיאת תקשורת עם השרת בעת ההתחברות',
      };
    }
  };

  const setup = async (email: string, password: string, setupToken?: string) => {
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, setupToken }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        const authedUser = data.user || { email, role: 'owner' };
        setIsConfigured(true);
        setIsAuthenticated(true);
        setUser(authedUser);
        sessionStorage.setItem(SESSION_HINT_KEY, 'true');
        sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(authedUser));
        setConnectionError(null);
        return { success: true };
      }

      return {
        success: false,
        error: data.error || 'הגדרת החשבון נכשלה',
      };
    } catch (err) {
      console.error('Setup error:', err);
      return {
        success: false,
        error: 'שגיאת תקשורת בעת יצירת חשבון המנהל',
      };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsAuthenticated(false);
      setUser(null);
      setConnectionError(null);
      sessionStorage.removeItem(SESSION_HINT_KEY);
      sessionStorage.removeItem(USER_CACHE_KEY);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        isConfigured,
        connectionError,
        retryConnection,
        checkAuthStatus,
        login,
        setup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
