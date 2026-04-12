import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { isAdminEmail } from '../../../utils/userRoles';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();

    if (!user || !isAdminEmail(user.email)) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
