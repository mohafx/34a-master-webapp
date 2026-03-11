import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';

const ADMIN_EMAIL = 'm.almajzoub1@gmail.com';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();

    if (!user || user.email !== ADMIN_EMAIL) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
