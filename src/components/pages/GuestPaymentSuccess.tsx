import { Navigate, useSearchParams } from 'react-router-dom';

export default function GuestPaymentSuccess() {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id');
    const target = sessionId
        ? `/payment-success?session_id=${encodeURIComponent(sessionId)}`
        : '/payment-success';

    return <Navigate to={target} replace />;
}
