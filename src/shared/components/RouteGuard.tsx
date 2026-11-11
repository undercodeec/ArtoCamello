// ====================================================================
// ArtoCamello — Route Guard Component
// ====================================================================
import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { UserRole } from '@/domain/types';
import { useAuth } from '@/shared/context/AuthContext';

interface RouteGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * Protects routes by role. Redirects guests to home (and opens login modal)
 * and wrong-role users to their proper dashboard.
 */
export function RouteGuard({ allowedRoles, children, redirectTo }: RouteGuardProps) {
  const { auth } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!auth.isAuthenticated) {
      // Open the login modal after redirect so the user can authenticate
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { view: 'login' } }));
      }, 100);
    }
  }, [auth.isAuthenticated]);

  if (!auth.isAuthenticated) {
    if (location.pathname === '/mis-solicitudes' || location.pathname === '/mi-perfil') sessionStorage.setItem('authReturnTo', location.pathname + location.search);
    return React.createElement(Navigate, {
      to: redirectTo || '/',
      state: { from: location },
      replace: true,
    });
  }

  if (!allowedRoles.includes(auth.role)) {
    if (auth.role === UserRole.GUEST) {
      if (location.pathname === '/mis-solicitudes' || location.pathname === '/mi-perfil') sessionStorage.setItem('authReturnTo', location.pathname + location.search);
      return React.createElement(Navigate, { to: '/onboarding', replace: true });
    }
    if (auth.role === UserRole.PROFESSIONAL) {
      return React.createElement(Navigate, { to: '/dashboard', replace: true });
    }
    return React.createElement(Navigate, { to: '/', replace: true });
  }

  return React.createElement(React.Fragment, null, children);
}
