import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const applySession = useCallback((session) => {
    if (session?.user) {
      setUser(session.user);
      setIsAuthenticated(true);
    } else {
      setUser(null);
      setIsAuthenticated(false);
    }
    setIsLoadingAuth(false);
    setAuthChecked(true);
  }, []);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    const { data: { session } } = await supabase.auth.getSession();
    applySession(session);
  }, [applySession]);

  useEffect(() => {
    checkUserAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // PASSWORD_RECOVERY fires when the user lands here from a "reset
      // password" email link; ResetPassword.jsx listens for this itself too.
      applySession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, [checkUserAuth, applySession]);

  const logout = (shouldRedirect = true) => {
    supabase.auth.signOut().finally(() => {
      setUser(null);
      setIsAuthenticated(false);
      if (shouldRedirect) window.location.href = '/login';
    });
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth
    }}>
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
