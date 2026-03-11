import React from 'react';

export const DashboardSkeleton = () => (
    <div className="min-h-screen px-6 pt-4 pb-32 lg:px-0 lg:pt-0 lg:pb-8 animate-pulse">
        {/* Header Card Skeleton */}
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-3xl h-64 mb-8 relative overflow-hidden">
            <div className="absolute top-6 left-6 right-6">
                <div className="flex justify-between items-start">
                    <div className="h-8 w-32 bg-white/20 rounded-lg"></div>
                    <div className="h-10 w-10 bg-white/20 rounded-full"></div>
                </div>
                <div className="mt-8 space-y-3">
                    <div className="h-10 w-3/4 bg-white/20 rounded-xl"></div>
                    <div className="h-10 w-1/2 bg-white/20 rounded-xl"></div>
                </div>
            </div>
            {/* Bottom part of header */}
            <div className="absolute bottom-6 left-6 right-6">
                <div className="h-14 w-full bg-white/10 rounded-2xl"></div>
            </div>
        </div>

        {/* Grid Skeletons */}
        <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-200 dark:bg-slate-800 rounded-3xl h-48 p-4 flex flex-col justify-between">
                <div className="w-14 h-14 bg-slate-300 dark:bg-slate-700 rounded-2xl"></div>
                <div className="space-y-2">
                    <div className="h-5 w-3/4 bg-slate-300 dark:bg-slate-700 rounded"></div>
                    <div className="h-3 w-1/2 bg-slate-300 dark:bg-slate-700 rounded"></div>
                </div>
            </div>
            <div className="bg-slate-200 dark:bg-slate-800 rounded-3xl h-48 p-4 flex flex-col justify-between">
                <div className="w-14 h-14 bg-slate-300 dark:bg-slate-700 rounded-2xl"></div>
                <div className="space-y-2">
                    <div className="h-5 w-3/4 bg-slate-300 dark:bg-slate-700 rounded"></div>
                    <div className="h-3 w-1/2 bg-slate-300 dark:bg-slate-700 rounded"></div>
                </div>
            </div>
        </div>

        {/* Bottom Card Skeleton */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-3xl h-32 p-4 flex items-center gap-4">
            <div className="w-16 h-16 bg-slate-300 dark:bg-slate-700 rounded-2xl flex-shrink-0"></div>
            <div className="flex-1 space-y-2">
                <div className="h-6 w-1/2 bg-slate-300 dark:bg-slate-700 rounded"></div>
                <div className="h-4 w-3/4 bg-slate-300 dark:bg-slate-700 rounded"></div>
            </div>
        </div>
    </div>
);
