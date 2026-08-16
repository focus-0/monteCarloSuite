import React from 'react';

const Logo = ({ size = 32 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ verticalAlign: 'middle' }}
    >
      <defs>
        {/* Glow Filters */}
        <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        
        {/* Line Gradients */}
        <linearGradient id="pathGrad1" x1="0%" y1="50%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00f2fe" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id="pathGrad2" x1="0%" y1="50%" x2="100%" y2="30%">
          <stop offset="0%" stopColor="#00f2fe" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
        <linearGradient id="pathGrad3" x1="0%" y1="50%" x2="100%" y2="70%">
          <stop offset="0%" stopColor="#00f2fe" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>

      {/* Dark Circular Container Ring */}
      <circle cx="50" cy="50" r="46" fill="#050811" stroke="#1e293b" strokeWidth="2" />

      {/* Concentric Probability Ring Background */}
      <ellipse cx="50" cy="50" rx="36" ry="36" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
      <ellipse cx="50" cy="50" rx="22" ry="22" stroke="#1e293b" strokeWidth="1" opacity="0.4" />

      {/* Brownian Motion Stochastic Simulation Trajectories */}
      {/* Path 1: Upper Bullish Surge */}
      <path
        d="M 18 50 Q 32 35, 42 42 T 62 26 T 82 20"
        fill="none"
        stroke="url(#pathGrad1)"
        strokeWidth="2.5"
        strokeLinecap="round"
        filter="url(#cyanGlow)"
      />

      {/* Path 2: Mid-Upper Drift */}
      <path
        d="M 18 50 Q 34 44, 48 38 T 68 34 T 82 36"
        fill="none"
        stroke="url(#pathGrad2)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* Path 3: Mean-Reverting Center Path */}
      <path
        d="M 18 50 Q 36 58, 48 48 T 68 54 T 82 50"
        fill="none"
        stroke="#60a5fa"
        strokeWidth="2"
        strokeDasharray="4 2"
        strokeLinecap="round"
      />

      {/* Path 4: Mid-Lower Bearish Fluctuation */}
      <path
        d="M 18 50 Q 34 56, 46 64 T 66 62 T 82 68"
        fill="none"
        stroke="url(#pathGrad3)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* Path 5: Lower Volatility Dip */}
      <path
        d="M 18 50 Q 32 68, 44 60 T 64 78 T 82 82"
        fill="none"
        stroke="url(#pathGrad3)"
        strokeWidth="2.5"
        strokeLinecap="round"
        filter="url(#cyanGlow)"
      />

      {/* Stochastic Origin Node (S0) */}
      <circle cx="18" cy="50" r="4.5" fill="#00f2fe" filter="url(#cyanGlow)" />
      <circle cx="18" cy="50" r="2" fill="#ffffff" />

      {/* Expiry Terminal Nodes */}
      <circle cx="82" cy="20" r="3" fill="#38bdf8" filter="url(#cyanGlow)" />
      <circle cx="82" cy="36" r="2.5" fill="#60a5fa" />
      <circle cx="82" cy="50" r="2.5" fill="#ffffff" />
      <circle cx="82" cy="68" r="2.5" fill="#60a5fa" />
      <circle cx="82" cy="82" r="3" fill="#2563eb" filter="url(#cyanGlow)" />
    </svg>
  );
};

export default Logo;
