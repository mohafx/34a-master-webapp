import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
    size?: 'sm' | 'md' | 'lg';
    fullWidth?: boolean;
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    isLoading = false,
    leftIcon,
    rightIcon,
    className = '',
    disabled,
    ...props
}) => {
    const baseStyles = "inline-flex items-center justify-center font-black tracking-wide uppercase rounded-2xl transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none transform";

    const variants = {
        primary: "bg-primary hover:bg-primary-hover text-white shadow-[0_6px_0_0_#1D4ED8] hover:shadow-[0_6px_0_0_#1D4ED8] active:shadow-none active:translate-y-[6px]",
        secondary: "bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-[0_4px_0_0_#E2E8F0] active:shadow-none active:translate-y-[4px]",
        success: "bg-success hover:bg-success-hover text-white shadow-[0_6px_0_0_#059669] active:shadow-none active:translate-y-[6px]",
        danger: "bg-error hover:bg-error-hover text-white shadow-[0_6px_0_0_#DC2626] active:shadow-none active:translate-y-[6px]",
        outline: "bg-transparent border-2 border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100",
        ghost: "bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700",
    };

    const sizes = {
        sm: "text-xs px-4 py-2 h-10",
        md: "text-sm px-6 py-3 h-12",
        lg: "text-base px-8 py-4 h-14",
    };

    const widthClass = fullWidth ? "w-full" : "";

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthClass} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            )}
            {!isLoading && leftIcon && <span className="mr-2">{leftIcon}</span>}
            {children}
            {!isLoading && rightIcon && <span className="ml-2">{rightIcon}</span>}
        </button>
    );
};
