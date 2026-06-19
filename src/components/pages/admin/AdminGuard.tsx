import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { isAdminEmail } from '../../../utils/userRoles';
import { isLocalhostDev } from '../../../utils/isLocalhostDev';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const location = useLocation();
    const allowLocalOralMock = isLocalhostDev()
        && location.pathname === '/oral-exam/live'
        && new URLSearchParams(location.search).get('devMock') === '1';

    if (!allowLocalOralMock && (!user || !isAdminEmail(user.email))) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
