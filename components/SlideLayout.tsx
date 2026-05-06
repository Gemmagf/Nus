
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SlideLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onNext: () => void;
  onPrev: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  footer?: React.ReactNode;
}

export const SlideLayout: React.FC<SlideLayoutProps> = ({ 
  children, 
  title, 
  subtitle, 
  onNext, 
  onPrev, 
  isFirst, 
  isLast,
  footer 
}) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-blue-100/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 -z-10"></div>
      <div className="absolute bottom-0 left-0 w-1/4 h-1/4 bg-teal-100/30 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 -z-10"></div>

      <header className="p-8 flex items-center justify-between">
        <div>
          {title && <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>}
          {subtitle && <p className="text-slate-500 mt-1 font-medium">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
            <div className="w-4 h-4 bg-teal-500 rounded-md flex items-center justify-center text-[9px] font-black">E</div>
            ERNEST
          </div>
        </div>
      </header>

      <main className="flex-1 px-8 py-4 flex flex-col items-center justify-center max-w-7xl mx-auto w-full">
        {children}
      </main>

      <footer className="p-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {!isFirst && (
            <button 
              onClick={onPrev}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
            >
              <ChevronLeft size={20} />
              <span>Anterior</span>
            </button>
          )}
        </div>
        
        {footer && <div>{footer}</div>}

        <div className="flex items-center gap-4">
          {!isLast && (
            <button 
              onClick={onNext}
              className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
            >
              <span>Següent</span>
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};
