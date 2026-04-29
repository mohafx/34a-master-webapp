import { PaywallView } from './PaywallView';

interface PaywallDialogProps {
    onClose: () => void;
    featureName?: string;
    tiktokPlanPayload?: unknown;
}

export function PaywallDialog({ onClose, featureName, tiktokPlanPayload }: PaywallDialogProps) {
    return (
        <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-100/90 dark:bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300 flex min-h-screen sm:min-h-full items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={onClose}
        >
            <div
                className="relative transform text-left shadow-2xl transition-all w-full sm:max-w-[420px] md:max-w-[950px] h-[95vh] md:h-auto md:max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 ease-out overflow-hidden flex flex-col my-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <PaywallView
                    onClose={onClose}
                    featureName={featureName}
                    isEmbedded={false}
                    tiktokPlanPayload={tiktokPlanPayload}
                />
            </div>
        </div>
    );
}
