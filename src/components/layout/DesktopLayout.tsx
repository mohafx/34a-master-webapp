import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import DesktopSidebar from './DesktopSidebar';
import { AuthDialog } from '../auth/AuthDialog';

interface DesktopLayoutProps {
    children: React.ReactNode;
}

export default function DesktopLayout({ children }: DesktopLayoutProps) {
    const location = useLocation();
    const [showAuthDialog, setShowAuthDialog] = useState(false);

    // Pages where sidebar should be hidden even on desktop
    const hideSidebarRoutes = [
        '/written-exam',
        '/quiz',
        '/forderung',
    ];

    const shouldHideSidebar = hideSidebarRoutes.some(route =>
        location.pathname.startsWith(route)
    );

    // No interactive lessons anymore
    const isInteractiveLesson = false;

    const hideSidebar = shouldHideSidebar || isInteractiveLesson;

    return (
        <>
            {/* Desktop Sidebar - hidden on mobile and on specific routes */}
            {!hideSidebar && (
                <DesktopSidebar onAuthClick={() => setShowAuthDialog(true)} />
            )}

            {/* Main Content Area */}
            <div className={`min-h-screen transition-all duration-300 ${!hideSidebar ? 'lg:ml-[280px]' : ''
                }`}>
                {/* Content Container - centered on desktop */}
                <div className={`${!hideSidebar
                    ? 'lg:max-w-4xl lg:mx-auto lg:px-8'
                    : ''
                    }`}>
                    {children}
                </div>
            </div>

            {/* Auth Dialog */}
            {showAuthDialog && (
                <AuthDialog
                    onClose={() => setShowAuthDialog(false)}
                    initialMode="register"
                />
            )}
        </>
    );
}
