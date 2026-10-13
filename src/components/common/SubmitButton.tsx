'use client';

import React, { useState } from 'react';

export interface SubmitButtonProps {
  onClick?: () => Promise<void> | void;
  label: React.ReactNode;
  loadingLabel?: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'danger' | 'secondary' | 'outline' | 'emerald';
  disabled?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
}

export default function SubmitButton({
  onClick,
  label,
  loadingLabel = 'Saving...',
  className = '',
  variant = 'primary',
  disabled = false,
  fullWidth = false,
  type = 'button',
}: SubmitButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isSubmitting || disabled) {
      e.preventDefault();
      return;
    }
    if (onClick) {
      setIsSubmitting(true);
      try {
        await onClick();
      } catch (err) {
        console.error('SubmitButton action error:', err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const baseStyles =
    'relative inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 select-none cursor-pointer';
  const widthStyle = fullWidth ? 'w-full' : '';

  const variantStyles = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 disabled:cursor-not-allowed shadow-xs',
    danger:
      'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 disabled:cursor-not-allowed shadow-xs',
    secondary:
      'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300 disabled:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed',
    outline:
      'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed',
    emerald:
      'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300 disabled:cursor-not-allowed shadow-xs',
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={isSubmitting || disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${widthStyle} ${className}`}
    >
      {isSubmitting && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      <span>{isSubmitting ? loadingLabel : label}</span>
    </button>
  );
}
