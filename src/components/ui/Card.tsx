import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'hoverable' | 'interactive';
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({
    children,
    variant = 'default',
    padding = 'md',
    className = '',
    ...props
}, ref) => {
    const baseStyles = "bg-white dark:bg-slate-850 rounded-3xl border border-slate-100 dark:border-slate-800 transition-all duration-200";

    const variants = {
        default: "shadow-card",
        hoverable: "shadow-card hover:shadow-card-hover hover:-translate-y-1 cursor-pointer",
        interactive: "shadow-card active:scale-[0.98] active:shadow-sm cursor-pointer hover:shadow-card-hover",
    };

    const paddings = {
        none: "",
        sm: "p-4",
        md: "p-4 sm:p-6",
        lg: "p-4 sm:p-6 lg:p-8",
    };

    return (
        <div
            ref={ref}
            className={`${baseStyles} ${variants[variant]} ${paddings[padding]} ${className}`}
            {...props}
        >
            {children}
        </div>
    );
});

Card.displayName = 'Card';
