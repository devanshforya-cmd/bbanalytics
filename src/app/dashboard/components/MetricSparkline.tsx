'use client';

import React from 'react';

interface MetricSparklineProps {
  data: number[];
  color: string;
  fillColor?: string;
  height?: number;
  className?: string;
}

export default function MetricSparkline({
  data,
  color,
  fillColor,
  height = 24,
  className = '',
}: MetricSparklineProps) {
  if (!data || data.length === 0) {
    return <div style={{ height: `${height}px` }} className="w-full" />;
  }

  const width = 120;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  const paddingY = 3;
  const usableHeight = height - paddingY * 2;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - paddingY - ((val - min) / range) * usableHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const fillD = `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;

  return (
    <div className={`w-full overflow-hidden ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        style={{ maxHeight: `${height}px` }}
        preserveAspectRatio="none"
      >
        {fillColor && (
          <path d={fillD} fill={fillColor} opacity={0.15} />
        )}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
