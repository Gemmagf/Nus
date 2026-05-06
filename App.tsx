
import React, { useState, useEffect } from 'react';
import { SlideLayout } from './components/SlideLayout';
import { DashboardDemo } from './components/DashboardDemo';
import { DashboardReal } from './src/components/DashboardReal';
import { HarnessIllustration } from './components/HarnessIllustration';
import {
  Heart, ShieldAlert, CheckCircle, Database, Smartphone,
  Activity, ArrowRight, Dog, Search, Users,
  Calendar, Layers, TrendingUp, BarChart3, Presentation,
  Zap, Brain, Bluetooth, MousePointer2, LayoutDashboard, ChevronLeft
} from 'lucide-react';

const App: React.FC = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showRealDashboard, setShowRealDashboard] = useState(false);

  const nextSlide = () => setCurrentSlide(prev => Math.min(prev + 1, slides.length - 1));
  const prevSlide = () => setCurrentSlide(prev => Math.max(prev - 1, 0));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextSlide();
      }
      if (e.key === 'ArrowLeft') prevSlide();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const slides = [
    // 1. Context / Problema
    <SlideLayout 
      key="0"
      title="El analisis del moviment Caní"
      subtitle="Per què arribem tard al 40% dels diagnòstics de mobilitat?"
      onNext={nextSlide} onPrev={prevSlide} isFirst
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="space-y-8">
          <div className="space-y-2">
            <h2 className="text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
              Detecció <span className="text-red-500 underline decoration-red-200 decoration-8 underline-offset-4">massa tardana</span>, observació subjectiva.
            </h2>
          </div>
          
          <div className="grid gap-6">
            <div className="flex gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <ShieldAlert size={28} />
              </div>
              <div>
                <h4 className="font-bold text-slate-900">Mètodes obsolets</h4>
                <p className="text-slate-500 text-sm">Confiem en la percepció visual del propietari, que sol normalitzar el dolor com a "vellesa".</p>
              </div>
            </div>
            
            <div className="flex gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <Zap size={28} />
              </div>
              <div>
                <h4 className="font-bold text-slate-900">Efecte Clínica</h4>
                <p className="text-slate-500 text-sm">L'adrenalina a la consulta emmascara la coixesa. El veterinari només veu "la foto", no la pel·lícula.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="relative group">
          <div className="absolute -inset-4 bg-gradient-to-tr from-teal-500/20 to-indigo-500/20 rounded-[2.5rem] blur-2xl group-hover:blur-3xl transition-all"></div>
          <div className="relative aspect-video overflow-hidden rounded-[2rem] border-8 border-white shadow-2xl">
            <img 
              src="https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&q=80&w=800" 
              className="w-full h-full object-cover" 
              alt="Gos gran descansant"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8">
              <p className="text-white font-medium text-lg italic">"Tant de bo haguéssim tingut dades objectives fa 6 mesos."</p>
            </div>
          </div>
        </div>
      </div>
    </SlideLayout>,

    // 2. Oportunitat
    <SlideLayout 
      key="1"
      title="Dades per Decidir"
      subtitle="Transformant la subjectivitat en biometria clínica"
      onNext={nextSlide} onPrev={prevSlide}
    >
      <div className="w-full max-w-5xl space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold text-slate-900">Més enllà del que l'ull humà pot veure</h2>
          <p className="text-slate-500 max-w-2xl mx-auto">La nostra tecnologia detecta variacions mil·limètriques en la simetria de marxa abans que la coixesa sigui visible.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="relative bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <Search size={120} />
             </div>
             <div className="relative z-10">
               <span className="text-slate-400 font-bold uppercase tracking-widest text-xs">Model Actual</span>
               <h3 className="text-3xl font-bold mt-2 mb-4">Reactiu</h3>
               <p className="text-slate-600 leading-relaxed">Esperem que el gos es queixi o que la coixesa sigui òbvia. El tractament és més costós i menys efectiu.</p>
               <div className="mt-8 flex items-center gap-2 text-red-500 font-bold">
                 <ShieldAlert size={20} /> Diagnòstic tardà
               </div>
             </div>
          </div>
          
          <div className="relative bg-slate-900 p-10 rounded-[2.5rem] shadow-2xl border border-slate-800 overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-20 animate-float">
               <Activity size={120} className="text-teal-500" />
             </div>
             <div className="relative z-10">
               <span className="text-teal-500 font-bold uppercase tracking-widest text-xs">Model Ernest</span>
               <h3 className="text-3xl font-bold mt-2 mb-4 text-white">Proactiu</h3>
               <p className="text-slate-400 leading-relaxed">Dades contínues 24/7. Detectem canvis de mobilitat setmanes abans de la manifestació clínica externa.</p>
               <div className="mt-8 flex items-center gap-2 text-teal-400 font-bold">
                 <CheckCircle size={20} /> Intervenció precoç
               </div>
             </div>
          </div>
        </div>
      </div>
    </SlideLayout>,

    // 3. Solució (Product Overview) - UPDATED with Illustration
    <SlideLayout 
      key="2"
      title="Ecosistema Ernest"
      subtitle="La fusió perfecta entre Hardware d'alta precisió i IA"
      onNext={nextSlide} onPrev={prevSlide}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-12">
          <div className="w-full md:w-1/2">
            <HarnessIllustration type="side" />
          </div>
          <div className="w-full md:w-1/2 space-y-6">
            <span className="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-xs font-bold">SMART HARDWARE</span>
            <h3 className="text-3xl font-bold text-slate-900">Arnès Cinemàtic</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <CheckCircle className="text-teal-500 flex-shrink-0 mt-1" size={18} />
                <span className="text-slate-600 text-sm"><strong>Sensor IMU de 9 eixos:</strong> Capta freqüència de pas, longitud i simetria.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="text-teal-500 flex-shrink-0 mt-1" size={18} />
                <span className="text-slate-600 text-sm"><strong>Material Mèdic:</strong> Ergonòmic, transpirable i apte per a ús 24h.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="text-teal-500 flex-shrink-0 mt-1" size={18} />
                <span className="text-slate-600 text-sm"><strong>Bateria de 14 dies:</strong> Dissenyat per a monitorització a llarg termini.</span>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="grid gap-8">
           <div className="bg-indigo-600 rounded-[2rem] p-8 text-white shadow-xl relative overflow-hidden group">
             <Smartphone className="absolute -bottom-4 -right-4 text-white/10 group-hover:scale-125 transition-transform" size={120} />
             <h4 className="font-bold text-xl mb-2">App Propietari</h4>
             <p className="text-indigo-100 text-sm">Feedback diari, recordatoris de medicació i "Pet Score" de mobilitat.</p>
           </div>
           <div className="bg-slate-900 rounded-[2rem] p-8 text-white shadow-xl relative overflow-hidden group">
             <Brain className="absolute -bottom-4 -right-4 text-teal-500/10 group-hover:scale-125 transition-transform" size={120} />
             <h4 className="font-bold text-xl mb-2">IA Veterinària</h4>
             <p className="text-slate-400 text-sm">Algorismes entrenats amb milers de patrons de marxa per detectar anomalies.</p>
           </div>
        </div>
      </div>
    </SlideLayout>,

    // 4. Flux Interactiu
    <SlideLayout 
      key="3"
      title="Flux de Valor"
      subtitle="Com convertim el moviment en una decisió clínica"
      onNext={nextSlide} onPrev={prevSlide}
    >
      <div className="relative w-full py-12">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-gradient-to-r from-teal-50 to-indigo-50 -translate-y-1/2 hidden lg:block"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-8">
          {[
            { icon: <Dog />, title: "Pas", desc: "El gos es mou amb normalitat a casa.", color: "bg-teal-500" },
            { icon: <Bluetooth />, title: "Sync", desc: "Dades enviades via BLE al mòbil.", color: "bg-blue-500" },
            { icon: <Database />, title: "Cloud", desc: "Anàlisi massiu en servidors segurs.", color: "bg-indigo-500" },
            { icon: <Brain />, title: "IA Insight", desc: "Detecció de micro-asimetries.", color: "bg-purple-500" },
            { icon: <ShieldAlert />, title: "Alerta", desc: "Notificació directa al centre vet.", color: "bg-red-500" }
          ].map((step, i) => (
            <div key={i} className="relative z-10 group flex flex-col items-center text-center">
              <div className={`w-20 h-20 ${step.color} rounded-[1.5rem] shadow-lg flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform`}>
                {React.cloneElement(step.icon as React.ReactElement, { size: 32 })}
              </div>
              <h4 className="font-bold text-slate-900 mb-2">{step.title}</h4>
              <p className="text-slate-500 text-xs px-4">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </SlideLayout>,

    // 5. Demo Dashboard (INTERACTIVA)
    <SlideLayout 
      key="4"
      title="Control Clínic Total"
      subtitle="Interactua amb el panell de gestió de pacients"
      onNext={nextSlide} onPrev={prevSlide}
    >
      <div className="w-full h-[650px] slide-enter">
        <DashboardDemo />
      </div>
    </SlideLayout>,

    // 6. Cas d'ús
    <SlideLayout 
      key="5"
      title="Cas d'Èxit: En Nus"
      subtitle="Recuperació un 30% més ràpida gràcies a l'ajust precoç"
      onNext={nextSlide} onPrev={prevSlide}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
             <div className="flex items-center gap-4 mb-6">
               <img src="https://picsum.photos/id/237/80/80" className="w-14 h-14 rounded-full" alt="Nus" />
               <div>
                 <h4 className="font-bold text-xl">Nus (Llaurador, 9a)</h4>
                 <p className="text-slate-400 text-sm">Post-op TPLO (Lligament Creuat)</p>
               </div>
             </div>
             <p className="text-slate-600 mb-6 italic leading-relaxed">
               "Sense Ernest, hauríem esperat a la revisió del mes. Vam detectar una infecció incipient gràcies a la baixada sobtada d'activitat al dia 4."
             </p>
             <div className="flex gap-4">
               <div className="flex-1 p-4 bg-teal-50 rounded-2xl">
                 <div className="text-teal-600 font-bold text-xl">14 dies</div>
                 <div className="text-teal-800/60 text-xs uppercase font-bold">Retorn a la marxa</div>
               </div>
               <div className="flex-1 p-4 bg-indigo-50 rounded-2xl">
                 <div className="text-indigo-600 font-bold text-xl">0 recaigudes</div>
                 <div className="text-indigo-800/60 text-xs uppercase font-bold">Seguretat Clínica</div>
               </div>
             </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <img src="https://images.unsplash.com/photo-1591768575198-88dac53fbd0a?auto=format&fit=crop&q=80&w=400" className="rounded-3xl shadow-lg h-full object-cover" alt="Examen vet" />
          <div className="grid gap-4">
             <img src="https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&q=80&w=400" className="rounded-3xl shadow-lg" alt="Gos corrent" />
             <div className="bg-slate-900 rounded-3xl p-6 text-white flex flex-col justify-center items-center text-center">
               <TrendingUp className="text-teal-400 mb-2" size={32} />
               <span className="text-2xl font-bold">+22%</span>
               <span className="text-xs text-slate-400">Adherència del propietari</span>
             </div>
          </div>
        </div>
      </div>
    </SlideLayout>,

    // 7. MVP i Pilot
    <SlideLayout 
      key="6"
      title="Roadmap del Pilot"
      subtitle="Validant la tecnologia en entorns reals"
      onNext={nextSlide} onPrev={prevSlide}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
        {[
          { icon: <Zap />, title: "Fase 1: Alpha", desc: "10 unitats en centres de rehabilitació d'elit.", val: "Q1 2024" },
          { icon: <Users />, title: "Fase 2: Beta", desc: "30 unitats en clíniques generalistes seleccionades.", val: "Q2 2024" },
          { icon: <TrendingUp />, title: "Fase 3: Scale", desc: "Llançament comercial amb 100+ unitats.", val: "Q4 2024" }
        ].map((item, i) => (
          <div key={i} className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col gap-6 hover:shadow-xl transition-shadow group">
            <div className="w-14 h-14 bg-slate-50 text-slate-400 group-hover:bg-teal-500 group-hover:text-white rounded-2xl flex items-center justify-center transition-colors">
              {item.icon}
            </div>
            <div>
              <span className="text-teal-600 font-bold text-sm uppercase">{item.val}</span>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{item.title}</h3>
              <p className="text-slate-500 mt-4 leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </SlideLayout>,

    // 8. Model de Negoci
    <SlideLayout 
      key="7"
      title="Model Comercial"
      subtitle="Escalabilitat B2B per a Clíniques"
      onNext={nextSlide} onPrev={prevSlide}
    >
      <div className="flex flex-col md:flex-row gap-8 w-full max-w-5xl">
        <div className="flex-1 bg-white p-12 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col gap-8">
           <h3 className="text-2xl font-bold">Inversió per Unitat</h3>
           <div className="space-y-4">
             <div className="flex justify-between items-center border-b border-slate-50 pb-4">
               <span className="text-slate-500">Hardware (Subscripció)</span>
               <span className="font-bold">49 CHF/mes</span>
             </div>
             <div className="flex justify-between items-center border-b border-slate-50 pb-4">
               <span className="text-slate-500">Software Pro (Cloud + IA)</span>
               <span className="font-bold">199 CHF/mes</span>
             </div>
             <div className="flex justify-between items-center pt-2">
               <span className="text-slate-900 font-bold">Pack Inicial (5 u.)</span>
               <span className="text-2xl font-bold text-teal-600">399 CHF/mes</span>
             </div>
           </div>
           <p className="text-xs text-slate-400">Marge estimat per a la clínica: 35-50% per pacient monitoritzat.</p>
        </div>
        
        <div className="flex-1 bg-slate-900 p-12 rounded-[3rem] text-white flex flex-col justify-between gap-8 relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-10">
             <Presentation size={180} />
           </div>
           <div className="relative z-10">
             <h3 className="text-2xl font-bold mb-4">ROI del Centre</h3>
             <ul className="space-y-4">
               <li className="flex gap-3">
                 <CheckCircle className="text-teal-400 flex-shrink-0" size={20} />
                 <span>Increment del 25% en visites de seguiment.</span>
               </li>
               <li className="flex gap-3">
                 <CheckCircle className="text-teal-400 flex-shrink-0" size={20} />
                 <span>Fidelització via App del propietari.</span>
               </li>
               <li className="flex gap-3">
                 <CheckCircle className="text-teal-400 flex-shrink-0" size={20} />
                 <span>Diferenciació tecnològica vs competència.</span>
               </li>
             </ul>
           </div>
           <button className="relative z-10 w-full py-5 bg-teal-500 text-white rounded-2xl font-bold hover:bg-teal-400 transition-colors shadow-lg shadow-teal-500/20">
             Contactar per a Vendes
           </button>
        </div>
      </div>
    </SlideLayout>,

    // 10. Feedback
    <SlideLayout 
      key="9"
      title="Construïm el futur de la salut canina"
      subtitle="Gràcies per la vostra atenció"
      onNext={nextSlide} onPrev={prevSlide} isLast
    >
      <div className="text-center space-y-12">
        <div className="animate-float inline-block">
          <div className="w-32 h-32 bg-gradient-to-tr from-teal-500 to-indigo-600 rounded-[2.5rem] shadow-2xl flex items-center justify-center text-white">
            <Heart size={64} fill="currentColor" />
          </div>
        </div>
        
        <div className="space-y-6">
          <h2 className="text-6xl font-black text-slate-900 tracking-tight">Voleu fer el salt digital?</h2>
          <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
            <button className="px-10 py-5 bg-slate-900 text-white rounded-[1.5rem] font-bold text-xl hover:scale-105 transition-transform flex items-center gap-3">
              <MousePointer2 /> Sí, m'interessa el pilot
            </button>
            <div className="text-slate-400 font-medium">o envia un email a <span className="text-teal-600 font-semibold">hola@massiusoft.com</span></div>
          </div>
        </div>
        
        <div className="flex justify-center gap-12 pt-12 text-slate-300">
           <div className="flex flex-col items-center">
             <span className="text-xs uppercase font-bold tracking-widest mb-2">Hardware</span>
             <div className="h-1 w-12 bg-teal-500/20 rounded-full"></div>
           </div>
           <div className="flex flex-col items-center">
             <span className="text-xs uppercase font-bold tracking-widest mb-2">Software</span>
             <div className="h-1 w-12 bg-indigo-500/20 rounded-full"></div>
           </div>
           <div className="flex flex-col items-center">
             <span className="text-xs uppercase font-bold tracking-widest mb-2">Clinical AI</span>
             <div className="h-1 w-12 bg-purple-500/20 rounded-full"></div>
           </div>
        </div>
      </div>
    </SlideLayout>
  ];

  // ── Mode Dashboard Real ────────────────────────────────────
  if (showRealDashboard) {
    return (
      <div className="h-screen w-screen bg-slate-100 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-100 shadow-sm">
          <button
            onClick={() => setShowRealDashboard(false)}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-900 text-sm transition"
          >
            <ChevronLeft size={16} /> Tornada presentació
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-sm font-semibold text-slate-700">Ernest — Dashboard Real (Supabase)</span>
          <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">LIVE</span>
        </div>
        <div className="flex-1 p-4 overflow-hidden">
          <DashboardReal />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#f8fafc] selection:bg-teal-100 selection:text-teal-900">
      <div className="transition-all duration-500 h-full">
        {slides[currentSlide]}
      </div>

      {/* Botó accés Dashboard Real */}
      <button
        onClick={() => setShowRealDashboard(true)}
        className="fixed top-4 right-4 flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-lg hover:bg-blue-700 transition z-50"
        title="Obre el dashboard connectat a Supabase"
      >
        <LayoutDashboard size={14} /> Dashboard Real
      </button>

      {/* Slide Indicator Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-2 flex gap-1.5 px-12 pb-6 z-50">
        {slides.map((_, i) => (
          <button
            key={i}
            className={`flex-1 rounded-full transition-all duration-500 overflow-hidden relative group ${i === currentSlide ? 'bg-teal-500' : 'bg-slate-200'}`}
            onClick={() => setCurrentSlide(i)}
            title={`Slide ${i + 1}`}
          >
            {i === currentSlide && (
              <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
            )}
            <div className="absolute inset-0 bg-teal-400 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default App;
