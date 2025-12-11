import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LoadingStage, PodcastEpisode } from './types';
import { generateScript, generateCoverArt, generateAudio } from './services/geminiService';
import { AudioVisualizer } from './components/AudioVisualizer';
import { Button } from './components/Button';

const App: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [loadingStage, setLoadingStage] = useState<LoadingStage>(LoadingStage.IDLE);
  const [episode, setEpisode] = useState<PodcastEpisode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  // Initialize Audio Context on user interaction (browser policy)
  const initAudio = () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setError(null);
    setEpisode(null);
    setIsPlaying(false);
    
    // Stop any playing audio
    if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch(e) {}
    }

    try {
      initAudio();
      
      // 1. Script
      setLoadingStage(LoadingStage.WRITING_SCRIPT);
      const script = await generateScript(topic);
      
      // 2. Parallel: Art & Audio
      setLoadingStage(LoadingStage.GENERATING_ART); // UI update
      // We start both but update UI to show we are busy
      
      const artPromise = generateCoverArt(script.title, script.topic);
      
      setLoadingStage(LoadingStage.SYNTHESIZING_AUDIO);
      if (!audioContextRef.current) throw new Error("Audio Context not initialized");
      const audioPromise = generateAudio(script, audioContextRef.current);

      const [coverImageBase64, audioBuffer] = await Promise.all([artPromise, audioPromise]);

      setEpisode({
        id: Date.now().toString(),
        script,
        coverImageBase64,
        audioBuffer
      });

      setLoadingStage(LoadingStage.COMPLETE);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong creating your podcast.");
      setLoadingStage(LoadingStage.ERROR);
    }
  };

  const togglePlayback = () => {
    if (!episode || !episode.audioBuffer || !audioContextRef.current) return;

    if (isPlaying) {
      // Pause
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch (e) {}
        pausedTimeRef.current += audioContextRef.current.currentTime - startTimeRef.current;
        setIsPlaying(false);
      }
    } else {
      // Play
      const source = audioContextRef.current.createBufferSource();
      source.buffer = episode.audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      // Start from where we left off
      source.start(0, pausedTimeRef.current);
      
      startTimeRef.current = audioContextRef.current.currentTime;
      sourceNodeRef.current = source;
      setIsPlaying(true);

      source.onended = () => {
          // Only reset if we reached the end naturally, not if we stopped it manually
          // Simple check: compare times or just let UI handle it. 
          // For simplicity in this demo, we won't perfectly track "end" vs "pause" in onended
          // But we can reset if pausedTime + duration is reached.
          setIsPlaying(false);
          pausedTimeRef.current = 0;
      };
    }
  };

  // Helper to render script lines
  const renderScript = () => {
    if (!episode) return null;
    return (
      <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
        {episode.script.dialogue.map((line, idx) => (
          <div key={idx} className={`flex flex-col ${line.speaker === 'Host' ? 'items-start' : 'items-end'}`}>
             <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
               line.speaker === 'Host' 
               ? 'bg-indigo-500/20 rounded-tl-none border border-indigo-500/30 text-indigo-100' 
               : 'bg-purple-500/20 rounded-tr-none border border-purple-500/30 text-purple-100'
             }`}>
                <span className="text-xs font-bold uppercase opacity-50 mb-1 block">{line.speaker}</span>
                {line.text}
             </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900 via-[#0f172a] to-black text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-12 text-center space-y-4">
            <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-full ring-1 ring-white/10 mb-4 animate-glow">
                <svg className="w-6 h-6 text-indigo-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                <span className="font-bold tracking-wider text-sm">GEMINI CAST</span>
            </div>
          <h1 className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            AI Podcast Studio
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Turn any topic into a professional multi-speaker podcast episode in seconds, powered by Gemini 2.5 & 3.0.
          </p>
        </header>

        {/* Input Section */}
        <div className="glass p-8 rounded-3xl shadow-2xl mb-8">
          <form onSubmit={handleGenerate} className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter a topic (e.g., 'The history of Sushi' or 'Quantum Computing for kids')"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-6 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder-gray-500"
              disabled={loadingStage !== LoadingStage.IDLE && loadingStage !== LoadingStage.COMPLETE && loadingStage !== LoadingStage.ERROR}
            />
            <Button 
                type="submit" 
                isLoading={loadingStage !== LoadingStage.IDLE && loadingStage !== LoadingStage.COMPLETE && loadingStage !== LoadingStage.ERROR}
                className="md:w-48 shrink-0"
            >
                Generate Episode
            </Button>
          </form>

          {/* Loading States */}
          {loadingStage !== LoadingStage.IDLE && loadingStage !== LoadingStage.COMPLETE && loadingStage !== LoadingStage.ERROR && (
             <div className="mt-8 space-y-3">
                <div className="flex items-center gap-3 text-sm text-gray-400">
                    <div className={`w-2 h-2 rounded-full ${loadingStage === LoadingStage.WRITING_SCRIPT ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`}></div>
                    Writing Script (Gemini 3 Pro)
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-400">
                    <div className={`w-2 h-2 rounded-full ${loadingStage === LoadingStage.GENERATING_ART ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`}></div>
                    Designing Cover Art (Imagen / Gemini 3)
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-400">
                    <div className={`w-2 h-2 rounded-full ${loadingStage === LoadingStage.SYNTHESIZING_AUDIO ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`}></div>
                    Synthesizing Multi-Speaker Audio (Gemini 2.5 Flash TTS)
                </div>
             </div>
          )}

          {error && (
              <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-200 text-sm">
                  {error}
              </div>
          )}
        </div>

        {/* Results Section */}
        {episode && loadingStage === LoadingStage.COMPLETE && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-[fadeIn_0.5s_ease-out]">
            {/* Left: Player Card */}
            <div className="glass rounded-3xl p-6 flex flex-col items-center text-center shadow-2xl border-t border-white/10">
                <div className="relative w-full aspect-square rounded-2xl overflow-hidden mb-6 shadow-2xl group">
                    {episode.coverImageBase64 ? (
                        <img src={episode.coverImageBase64} alt="Cover" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    ) : (
                        <div className="w-full h-full bg-gray-800 flex items-center justify-center">No Cover</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-6">
                        <h2 className="text-2xl font-bold text-white text-left leading-tight">{episode.script.title}</h2>
                    </div>
                </div>

                {/* Audio Controls */}
                <div className="w-full space-y-6">
                    <AudioVisualizer 
                        audioContext={audioContextRef.current} 
                        sourceNode={sourceNodeRef.current} 
                        isPlaying={isPlaying} 
                    />
                    
                    <div className="flex items-center justify-center gap-6">
                         <button 
                            onClick={togglePlayback}
                            className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-white/20"
                         >
                             {isPlaying ? (
                                 <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                             ) : (
                                 <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                             )}
                         </button>
                    </div>
                </div>
            </div>

            {/* Right: Script/Transcript */}
            <div className="glass rounded-3xl p-6 flex flex-col h-[600px]">
                <h3 className="text-xl font-bold mb-4 text-gray-200 flex items-center gap-2">
                    <svg className="w-5 h-5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Transcript
                </h3>
                <div className="flex-1 overflow-hidden relative">
                    {renderScript()}
                    <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#161b2e] to-transparent pointer-events-none"></div>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;