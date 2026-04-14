
import React from 'react';

export const HarnessIllustration: React.FC<{ type?: 'front' | 'side' | 'detail' }> = ({ type = 'side' }) => {
  if (type === 'side') {
    return (
      <svg viewBox="0 0 400 300" className="w-full h-full drop-shadow-2xl" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Stylized Dog Outline (Ghostly/Technical) */}
        <path d="M50 200 C 50 150, 100 120, 150 110 C 200 100, 250 100, 300 120 L 350 140 L 330 220 L 250 250 L 100 240 Z" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="5 5" />
        
        {/* The Harness Body */}
        <path d="M140 115 Q 180 105, 230 115 L 240 180 Q 185 195, 130 180 Z" fill="#0d9488" fillOpacity="0.1" stroke="#0d9488" strokeWidth="3" />
        <path d="M145 125 L 135 170" stroke="#0d9488" strokeWidth="6" strokeLinecap="round" /> {/* Front Strap */}
        <path d="M225 125 L 235 175" stroke="#0d9488" strokeWidth="6" strokeLinecap="round" /> {/* Back Strap */}
        <path d="M140 120 L 230 120" stroke="#0d9488" strokeWidth="8" strokeLinecap="round" /> {/* Main Spine */}
        
        {/* Sensor Modules */}
        <rect x="175" y="105" width="30" height="30" rx="8" fill="white" stroke="#0d9488" strokeWidth="2" className="animate-pulse" />
        <circle cx="190" cy="120" r="4" fill="#0d9488" />
        
        {/* Technical Callouts */}
        <line x1="190" y1="105" x2="190" y2="50" stroke="#94a3b8" strokeWidth="1" />
        <text x="170" y="40" fill="#64748b" fontSize="12" fontWeight="bold">IMU 9-Axis Sensor</text>
        
        <line x1="135" y1="145" x2="60" y2="145" stroke="#94a3b8" strokeWidth="1" />
        <text x="0" y="148" fill="#64748b" fontSize="10">Ergonòmic Soft-Touch</text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 200 200" className="w-full h-full">
      <circle cx="100" cy="100" r="80" fill="#0d9488" fillOpacity="0.05" stroke="#0d9488" strokeWidth="1" strokeDasharray="4 4" />
      <rect x="70" y="70" width="60" height="60" rx="12" fill="white" stroke="#0d9488" strokeWidth="2" />
      <path d="M85 100 H 115 M100 85 V 115" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" />
      <text x="50" y="160" fill="#0d9488" fontSize="10" fontWeight="bold">Detall Micro-Sensor</text>
    </svg>
  );
};
