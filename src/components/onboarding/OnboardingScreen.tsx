import React from 'react';

interface OnboardingScreenProps {
  badge?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export default function OnboardingScreen({
  badge,
  title,
  subtitle,
  children,
  className = ''
}: OnboardingScreenProps) {
  return (
    <div className={`flex flex-col items-center text-center px-4 ${className}`}>
      {/* Badge */}
      {badge && (
        <div className="mb-4 animate-fadeIn">
          <span className="inline-block px-3 py-1.5 bg-white/15 backdrop-blur-sm rounded-full text-[11px] sm:text-xs font-semibold text-white/90 border border-white/20">
            {badge}
          </span>
        </div>
      )}

      {/* Title */}
      <h1 className="text-[clamp(1.5rem,5vw,2rem)] font-black text-white leading-tight mb-2 animate-fadeUp">
        {title}
      </h1>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-[clamp(0.875rem,3vw,1.125rem)] text-white/80 font-medium leading-relaxed mb-4 max-w-sm animate-fadeUp delay-100">
          {subtitle}
        </p>
      )}

      {/* Content */}
      <div className="w-full max-w-sm animate-fadeUp delay-200">
        {children}
      </div>
    </div>
  );
}
