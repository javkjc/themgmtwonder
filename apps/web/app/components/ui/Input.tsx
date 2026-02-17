import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, fullWidth = false, className = '', ...props }, ref) => {
    return (
      <div className={`${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label className="block text-sm font-medium text-mono-400 dark:text-mono-600 mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full px-3.5 py-2.5
            bg-white dark:bg-mono-100
            text-mono-50 dark:text-mono-950
            border border-mono-800 dark:border-mono-300 rounded-md
            text-sm
            placeholder:text-mono-600 dark:placeholder:text-mono-500
            focus:outline-none focus:ring-2 focus:ring-coral-500/40 focus:border-coral-500
            transition-all duration-150
            disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-mono-900 dark:disabled:bg-mono-200
            ${error ? 'border-red-500 focus:ring-red-500' : ''}
            ${className}
          `.trim()}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
