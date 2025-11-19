import { ReactNode } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GraduationCap, LayoutDashboard, Upload, Users, LogOut, BarChart3 } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  setView?: (view: string) => void; // added to handle dashboard view switching
}

export function Layout({ children, setView }: LayoutProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = () => {
    signOut();
    navigate('/login');
  };

  const handleMLClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (setView && user?.role === 'admin' && location.pathname === '/dashboard') {
      // trigger the ML model view dynamically inside Admin Dashboard
      setView('ml');
    } else {
      // fallback route navigation (non-dashboard pages)
      navigate('/model');
    }
  };

  const getNavItems = () => {
    switch (user?.role) {
      case 'student':
        return [
          { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
          { to: '/performance', icon: BarChart3, label: 'Performance' },
        ];
      case 'teacher':
        return [
          { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
          { to: '/upload', icon: Upload, label: 'Upload Data' },
          { to: '/analytics', icon: BarChart3, label: 'Analytics' },
        ];
      case 'admin':
        return [
          { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
          { to: '/users', icon: Users, label: 'Users' },
          // ML Model now triggers dashboard toggle
          { to: '/model', icon: BarChart3, label: 'ML Model', onClick: handleMLClick },
        ];
      default:
        return [];
    }
  };

  const navItems = getNavItems();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8">
              {/* Logo */}
              <Link to="/dashboard" className="flex items-center gap-2">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-gray-900">EduAI</span>
              </Link>

              {/* Navigation */}
              <div className="hidden md:flex items-center gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.to;

                  if (item.label === 'ML Model') {
                    // Custom ML Model button
                    return (
                      <button
                        key={item.to}
                        onClick={item.onClick}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                          isActive
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* User Info + Signout */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
