import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, ...props }, ref) => {
    const baseStyles = `
      inline-flex items-center justify-center
      font-semibold
      transition-all duration-150
      disabled:opacity-50 disabled:cursor-not-allowed
      focus:outline-none focus:ring-2 focus:ring-offset-1
    `;

    const variants = {
      primary: `
        bg-coral-500 text-white
        hover:bg-coral-600
        focus:ring-coral-500/40
        dark:bg-coral-500 dark:hover:bg-coral-600
      `,
      secondary: `
        bg-mono-900 dark:bg-mono-200
        text-mono-50 dark:text-mono-950
        border border-mono-800 dark:border-mono-300
        hover:bg-mono-800 dark:hover:bg-mono-300
        focus:ring-mono-500/30
      `,
      success: `
        bg-green-500 text-white
        hover:bg-green-600
        focus:ring-green-500/40
        dark:bg-green-600 dark:hover:bg-green-700
      `,
      danger: `
        bg-red-500 text-white
        hover:bg-red-600
        focus:ring-red-500/40
        dark:bg-red-600 dark:hover:bg-red-700
      `,
      ghost: `
        bg-transparent text-mono-400 dark:text-mono-600
        hover:bg-mono-900 dark:hover:bg-mono-200
        hover:text-mono-50 dark:hover:text-mono-950
        focus:ring-mono-500/30
      `,
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs rounded-md',
      md: 'px-4 py-2.5 text-sm rounded-md',
      lg: 'px-6 py-3 text-base rounded-md',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`.trim()}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
