import React from 'react';
import Image from 'next/image';

/**
 * The Brand Bucket logo. "full" is the BB mark with the Brandbucket wordmark; "mark" is the BB
 * icon alone for tight spaces. Both are drawn for light backgrounds.
 */
export default function BrandLogo({ variant = 'full', className = '', priority = false }: { variant?: 'full' | 'mark'; className?: string; priority?: boolean }) {
  return variant === 'full'
    ? <Image src="/brand/bb-logo.png" alt="Brand Bucket" width={839} height={231} priority={priority} className={`h-8 w-auto select-none ${className}`} />
    : <Image src="/brand/bb-mark.png" alt="Brand Bucket" width={181} height={181} priority={priority} className={`h-8 w-8 select-none ${className}`} />;
}
