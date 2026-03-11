import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X, Crown } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'premium';

interface Toast {
    id: string;
    message: string;
    title?: string;
    type: ToastType;
    duration?: number;
}

interface PremiumToastState {
    visible: boolean;
    featureName?: string;
    onComplete?: () => void;
}

interface ToastContextType {
    showToast: (options: Omit<Toast, 'id'>) => void;
    showSuccess: (message: string, title?: string) => void;
    showError: (message: string, title?: string) => void;
    showWarning: (message: string, title?: string) => void;
    showInfo: (message: string, title?: string) => void;
    showPremiumToast: (featureName?: string, onComplete?: () => void) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [premiumToast, setPremiumToast] = useState<PremiumToastState>({ visible: false });

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const showToast = useCallback((options: Omit<Toast, 'id'>) => {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const toast: Toast = {
            ...options,
            id,
            duration: options.duration ?? 5000,
        };
        setToasts((prev) => [...prev, toast]);
    }, []);

    const showSuccess = useCallback((message: string, title?: string) => {
        showToast({ message, title, type: 'success' });
    }, [showToast]);

    const showError = useCallback((message: string, title?: string) => {
        showToast({ message, title, type: 'error', duration: 7000 });
    }, [showToast]);

    const showWarning = useCallback((message: string, title?: string) => {
        showToast({ message, title, type: 'warning' });
    }, [showToast]);

    const showInfo = useCallback((message: string, title?: string) => {
        showToast({ message, title, type: 'info' });
    }, [showToast]);

    const showPremiumToast = useCallback((featureName?: string, onComplete?: () => void) => {
        setPremiumToast({ visible: true, featureName, onComplete });
    }, []);

    const hidePremiumToast = useCallback(() => {
        const callback = premiumToast.onComplete;
        setPremiumToast({ visible: false });
        // Trigger callback after a brief delay for animation
        if (callback) {
            setTimeout(callback, 200);
        }
    }, [premiumToast.onComplete]);

    // Register global toast handler for use outside React components
    useEffect(() => {
        registerToastHandler({ showSuccess, showError, showInfo, showWarning, showPremiumToast });
        return () => registerToastHandler(null as any);
    }, [showSuccess, showError, showInfo, showWarning, showPremiumToast]);

    return (
        <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo, showPremiumToast }}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            {premiumToast.visible && (
                <PremiumToastOverlay onComplete={hidePremiumToast} />
            )}
        </ToastContext.Provider>
    );
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
    return (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[9999] flex flex-col gap-3 max-w-sm sm:max-w-md ml-auto">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
            ))}
        </div>
    );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
    useEffect(() => {
        if (toast.duration) {
            const timer = setTimeout(onClose, toast.duration);
            return () => clearTimeout(timer);
        }
    }, [toast.duration, onClose]);

    const icons: Record<string, React.ReactNode> = {
        success: <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />,
        error: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
        warning: <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />,
        info: <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />,
        premium: <Crown className="w-5 h-5 text-amber-500 flex-shrink-0" />,
    };

    const bgColors: Record<string, string> = {
        success: 'bg-green-50 dark:bg-green-950/80 border-green-200 dark:border-green-800',
        error: 'bg-red-50 dark:bg-red-950/80 border-red-200 dark:border-red-800',
        warning: 'bg-amber-50 dark:bg-amber-950/80 border-amber-200 dark:border-amber-800',
        info: 'bg-blue-50 dark:bg-blue-950/80 border-blue-200 dark:border-blue-800',
        premium: 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/80 dark:to-orange-950/80 border-amber-200 dark:border-amber-800',
    };

    return (
        <div
            className={`${bgColors[toast.type]} backdrop-blur-lg rounded-xl shadow-lg border p-4 animate-slide-up flex items-start gap-3`}
            role="alert"
        >
            {icons[toast.type]}
            <div className="flex-1 min-w-0">
                {toast.title && (
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">
                        {toast.title}
                    </p>
                )}
                <p className="text-gray-700 dark:text-gray-200 text-sm whitespace-pre-line">
                    {toast.message}
                </p>
            </div>
            <button
                onClick={onClose}
                className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors flex-shrink-0"
                aria-label="Schließen"
            >
                <X className="w-4 h-4 text-gray-500" />
            </button>
        </div>
    );
}

// Premium Toast Overlay - Centered on screen with animation
function PremiumToastOverlay({ onComplete }: { onComplete: () => void }) {
    const [isExiting, setIsExiting] = useState(false);

    // Check language logic
    const isArabic = (() => {
        try {
            const stored = localStorage.getItem('app_settings');
            return stored ? JSON.parse(stored).language === 'DE_AR' : false;
        } catch { return false; }
    })();

    useEffect(() => {
        // Auto-dismiss after 1.0 seconds
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(onComplete, 300); // Wait for exit animation
        }, 1000);

        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 pointer-events-none`}>
            {/* Backdrop */}
            <div className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ${isExiting ? 'opacity-0' : 'opacity-100'}`} />

            {/* Toast Card */}
            <div
                className={`relative bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-slate-800 dark:via-slate-850 dark:to-slate-900 rounded-3xl shadow-2xl shadow-amber-200/50 dark:shadow-amber-900/30 border-2 border-amber-200 dark:border-amber-700/50 p-6 max-w-xs text-center transform transition-all duration-300 ${isExiting
                    ? 'opacity-0 scale-95 translate-y-4'
                    : 'opacity-100 scale-100 translate-y-0'
                    }`}
            >
                {/* Crown Icon */}
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-300/50 animate-pulse">
                    <Crown className="w-8 h-8 text-white" strokeWidth={2.5} />
                </div>

                {/* German Text */}
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1">
                    Erhalte vollen Zugriff
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                    Werde Premium-Nutzer
                </p>

                {/* Arabic Text */}
                {isArabic && (
                    <div className="mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-700/30" dir="rtl">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            احصل على الوصول الكامل
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            كن مستخدمًا مميزًا
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within ToastProvider');
    return context;
}

// Global toast emitter for use outside React components
type GlobalToastHandler = {
    showSuccess: (message: string, title?: string) => void;
    showError: (message: string, title?: string) => void;
    showInfo: (message: string, title?: string) => void;
    showWarning: (message: string, title?: string) => void;
    showPremiumToast: (featureName?: string, onComplete?: () => void) => void;
};

let globalToastHandler: GlobalToastHandler | null = null;

export function registerToastHandler(handler: GlobalToastHandler) {
    globalToastHandler = handler;
}

export const toast = {
    success: (message: string, title?: string) => globalToastHandler?.showSuccess(message, title),
    error: (message: string, title?: string) => globalToastHandler?.showError(message, title),
    info: (message: string, title?: string) => globalToastHandler?.showInfo(message, title),
    warning: (message: string, title?: string) => globalToastHandler?.showWarning(message, title),
    premium: (featureName?: string, onComplete?: () => void) => globalToastHandler?.showPremiumToast(featureName, onComplete),
};
