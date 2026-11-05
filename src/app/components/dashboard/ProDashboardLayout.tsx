import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import { LayoutDashboard, Users, User, Receipt, LogOut, Menu, X, Bell } from 'lucide-react';
import { logout, getCurrentAuth } from '@/services/authService';
import { listMatchingRequestsForProfessional } from '@/services/requestService';
import { listUnlockedContacts } from '@/services/leadService';

export function ProDashboardLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [userName, setUserName] = useState('Profesional');
  const navigate = useNavigate();
  const auth = getCurrentAuth();

  useEffect(() => {
    // Cargar nombre de usuario
    try {
      const cached = sessionStorage.getItem('cachedUser');
      if (cached) {
        const u = JSON.parse(cached);
        if (u?.fullName) setUserName(u.fullName.split(' ')[0]);
      }
    } catch { /* ignore */ }

    // Contar solicitudes nuevas (no desbloqueadas aún)
    if (auth.userId) {
      Promise.all([
        listMatchingRequestsForProfessional(auth.userId),
        listUnlockedContacts(auth.userId),
      ]).then(([available, unlocked]) => {
        const unlockedIds = new Set(unlocked.map((u) => u.purchase.requestId));
        const newCount = available.filter((j) => !unlockedIds.has(j.id)).length;
        setPendingCount(newCount);
      }).catch(() => setPendingCount(0));
    }
  }, [auth.userId]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Resumen', end: true, badge: null },
    {
      to: '/dashboard/contacts',
      icon: Users,
      label: 'Mis Contactos',
      badge: pendingCount > 0 ? pendingCount : null,
      highlight: true,
    },
    { to: '/dashboard/profile', icon: User, label: 'Mi Perfil', badge: null },
    { to: '/dashboard/wallet', icon: Receipt, label: 'Pagos y Facturación', badge: null },
  ];

  const initials = userName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-[#101828] text-white p-4 flex justify-between items-center sticky top-0 z-50">
        <span className="font-bold text-xl text-[#FFCA0C]">ArtoCamello Pro</span>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`
        fixed md:sticky top-0 left-0 h-screen w-64 bg-[#101828] text-white flex flex-col transition-transform duration-300 z-40
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-6 hidden md:block border-b border-gray-800">
          <span className="font-bold text-2xl text-[#FFCA0C] tracking-tight">
            ArtoCamello <span className="text-white text-lg font-medium">Pro</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium relative
                ${isActive
                  ? 'bg-[#FFCA0C] text-[#101828] shadow-md'
                  : (item as any).highlight
                    ? 'hover:bg-gray-800 text-gray-200 hover:text-white ring-1 ring-gray-700'
                    : 'hover:bg-gray-800 text-gray-400 hover:text-white'
                }
              `}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge !== null && item.badge > 0 && (
                <span className="bg-[#FFCA0C] text-[#101828] text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full shrink-0 shadow-sm">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-3 py-3 mb-3 bg-gray-800 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFCA0C] to-[#f5a900] flex items-center justify-center text-[#101828] font-bold text-lg shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{userName}</p>
              <p className="text-xs text-gray-400">Profesional verificado</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            id="btn-logout"
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors font-medium"
          >
            <LogOut className="w-5 h-5" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 w-full max-w-[1200px] mx-auto overflow-x-hidden">
        <Outlet />
      </main>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
