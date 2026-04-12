import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../App';
import { useAuth } from '../../contexts/AuthContext';
import {
    Home,
    BookOpen,
    Pencil,
    GraduationCap,
    BarChart3,
    User,
    Languages,
    Moon,
    Sun,
    LogIn,
    Layers,
    Map
} from 'lucide-react';

interface NavItem {
    path: string;
    labelDE: string;
    labelAR: string;
    icon: React.ElementType;
}

const navItems: NavItem[] = [
    { path: '/', labelDE: 'Dashboard', labelAR: 'لوحة التحكم', icon: Home },
    { path: '/learn', labelDE: 'Lernen', labelAR: 'التعلم', icon: BookOpen },
    { path: '/practice', labelDE: 'Üben', labelAR: 'التدريب', icon: Pencil },
    { path: '/flashcards', labelDE: 'Lernkarten', labelAR: 'البطاقات', icon: Layers },
    { path: '/exam', labelDE: 'Prüfung', labelAR: 'الامتحان', icon: GraduationCap },
    { path: '/statistics', labelDE: 'Statistik', labelAR: 'الإحصائيات', icon: BarChart3 },
];

interface DesktopSidebarProps {
    onAuthClick: () => void;
}

export default function DesktopSidebar({ onAuthClick }: DesktopSidebarProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, language, toggleLanguage, showLanguageToggle, settings, updateSettings } = useApp();
    const { user: authUser } = useAuth();

    // Theme from app settings (single source of truth)
    const isDarkMode = settings.darkMode ?? false;

    const handleThemeToggle = () => {
        // Use updateSettings to persist to localStorage + DB
        updateSettings({ darkMode: !isDarkMode, autoTheme: false });
    };

    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    const userName = authUser?.user_metadata?.display_name || authUser?.email?.split('@')[0] || 'User';

    return (
        <aside className="hidden lg:flex flex-col w-[280px] h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 fixed left-0 top-0 z-40">
            {/* Logo Section */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-primary/20">
                        34a
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">34a Master</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">IHK Sachkunde</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 px-3 overflow-y-auto">
                <div className="space-y-1">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.path);

                        return (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${active
                                    ? 'bg-primary/10 dark:bg-primary/20 text-primary'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                            >
                                <Icon
                                    size={20}
                                    strokeWidth={active ? 2.5 : 2}
                                    className={active ? 'text-primary' : 'group-hover:text-primary transition-colors'}
                                />
                                <div className="flex-1 text-left">
                                    <span className={`font-bold text-sm ${active ? 'text-primary' : ''}`}>
                                        {item.labelDE}
                                    </span>
                                    {language === 'DE_AR' && (
                                        <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5" dir="rtl">
                                            {item.labelAR}
                                        </span>
                                    )}
                                </div>
                                {active && (
                                    <div className="w-1.5 h-8 bg-primary rounded-full" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Divider */}
                <div className="my-4 border-t border-slate-100 dark:border-slate-800" />

                {/* Quick Actions */}
                <div className="space-y-1">
                    {/* Language Toggle - Only show when enabled */}
                    {showLanguageToggle && (
                        <button
                            onClick={toggleLanguage}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${language === 'DE_AR'
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                        >
                            <Languages size={20} strokeWidth={2} />
                            <div className="flex-1 text-left">
                                <span className="font-bold text-sm">
                                    {language === 'DE' ? 'Deutsch' : 'Deutsch + Arabisch'}
                                </span>
                                <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                    Sprache wechseln
                                </span>
                            </div>
                        </button>
                    )}

                    {/* Theme Toggle */}
                    <button
                        onClick={handleThemeToggle}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        {isDarkMode ? <Moon size={20} strokeWidth={2} /> : <Sun size={20} strokeWidth={2} />}
                        <div className="flex-1 text-left">
                            <span className="font-bold text-sm">
                                {isDarkMode ? 'Dark Mode' : 'Light Mode'}
                            </span>
                            <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                Design wechseln
                            </span>
                        </div>
                    </button>
                </div>
            </nav>

            {/* User Section */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                {user ? (
                    <button
                        onClick={() => navigate('/profile')}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                        <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center text-white font-bold">
                            {userName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                            <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{userName}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Profil anzeigen</p>
                        </div>
                    </button>
                ) : (
                    <button
                        onClick={onAuthClick}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors"
                    >
                        <LogIn size={20} strokeWidth={2} />
                        <div className="flex-1 text-left">
                            <span className="font-bold text-sm">Anmelden</span>
                            {language === 'DE_AR' && (
                                <span className="block text-xs text-white/80 mt-0.5" dir="rtl">تسجيل الدخول</span>
                            )}
                        </div>
                    </button>
                )}
            </div>

            {/* Version Info */}
            <div className="px-6 py-3 text-center border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs text-slate-400 dark:text-slate-500">Version 1.0.0 Beta</p>
            </div>
        </aside>
    );
}
