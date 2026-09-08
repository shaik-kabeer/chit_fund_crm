'use client';

import { useCallback, useRef, useState, useEffect } from 'react';

type SpeechLang = 'hi-IN' | 'ur-PK' | 'en-IN';

interface UseSpeechReturn {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  finalTranscript: string;
  startListening: (lang?: SpeechLang) => void;
  stopListening: () => void;
  speak: (text: string, lang?: SpeechLang) => void;
  stopSpeaking: () => void;
  supported: boolean;
  availableVoices: string[];
}

const SpeechRecognition =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

/**
 * Score a voice for Hindi/Urdu native-sounding quality.
 * Higher score = better match for natural Indian Hindi speech.
 */
function scoreHindiVoice(voice: SpeechSynthesisVoice, lang: SpeechLang): number {
  let score = 0;
  const name = voice.name.toLowerCase();
  const vLang = voice.lang.toLowerCase();

  // Exact language match
  if (vLang === lang.toLowerCase()) score += 50;
  else if (vLang.startsWith(lang.split('-')[0].toLowerCase())) score += 30;
  else return 0;

  // Prefer Google voices (Chrome's Google Hindi sounds most natural)
  if (name.includes('google')) score += 40;

  // Prefer Microsoft voices on Edge/Windows (they have good Hindi voices)
  if (name.includes('microsoft') && name.includes('swara')) score += 35;
  if (name.includes('microsoft') && name.includes('madhur')) score += 35;
  if (name.includes('microsoft')) score += 20;

  // Prefer voices with Hindi/Devanagari in the name
  if (name.includes('हिन्दी') || name.includes('hindi')) score += 15;

  // Prefer female voices for clarity (generally clearer TTS)
  if (name.includes('female') || name.includes('swara')) score += 5;

  // Prefer local voices over remote (lower latency)
  if (!voice.localService) score += 2;
  else score += 5;

  return score;
}

export function useSpeech(): UseSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);
  const recognitionRef = useRef<any>(null);
  const voiceCacheRef = useRef<Map<string, SpeechSynthesisVoice>>(new Map());

  const supported = typeof window !== 'undefined' && !!SpeechRecognition && !!window.speechSynthesis;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;

      // Cache best voice for each language
      for (const lang of ['hi-IN', 'ur-PK', 'en-IN'] as SpeechLang[]) {
        const scored = voices
          .map((v) => ({ voice: v, score: scoreHindiVoice(v, lang) }))
          .filter((v) => v.score > 0)
          .sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
          voiceCacheRef.current.set(lang, scored[0].voice);
        }
      }

      const hindiVoices = voices
        .filter((v) => v.lang.startsWith('hi') || v.lang.startsWith('ur'))
        .map((v) => `${v.name} (${v.lang})${v.localService ? ' [local]' : ''}`);
      setAvailableVoices(hindiVoices);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const startListening = useCallback((lang: SpeechLang = 'hi-IN') => {
    if (!SpeechRecognition) {
      console.error('SpeechRecognition not available');
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let lastFinal = '';

      recognition.onstart = () => {
        setIsListening(true);
        setTranscript('');
        setFinalTranscript('');
        lastFinal = '';
      };

      recognition.onresult = (event: any) => {
        let final = '';
        let interim = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        setTranscript(final || interim);
        if (final) {
          lastFinal = final;
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          console.error('Speech recognition error:', event.error);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (lastFinal) {
          setFinalTranscript(lastFinal);
        }
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
        setIsListening(false);
      }
    }).catch((err) => {
      console.error('Microphone permission denied:', err);
      alert('Microphone access denied. Please allow microphone permission in your browser settings and try again.');
    });
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const speak = useCallback((text: string, lang: SpeechLang = 'hi-IN') => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    // Clean the text for better TTS: remove emojis, special chars
    const cleanText = text
      .replace(/[✅⚠️🎉❌📊💰🔔📋]/g, '')
      .replace(/₹/g, 'rupaye ')
      .replace(/\n+/g, '. ')
      .trim();

    if (!cleanText) return;

    // Split long text into chunks for Chrome's 15-second TTS limit
    const chunks = splitTextForTTS(cleanText);

    let chunkIndex = 0;

    const speakChunk = () => {
      if (chunkIndex >= chunks.length) {
        setIsSpeaking(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      utterance.lang = lang;

      // Slower rate for Hindi to sound more natural and articulate
      if (lang.startsWith('hi') || lang.startsWith('ur')) {
        utterance.rate = 0.85;
        utterance.pitch = 1.0;
      } else {
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
      }

      // Use cached best voice
      const cachedVoice = voiceCacheRef.current.get(lang);
      if (cachedVoice) {
        utterance.voice = cachedVoice;
      } else {
        // Fallback: find best voice at speak time
        const voices = window.speechSynthesis.getVoices();
        const scored = voices
          .map((v) => ({ voice: v, score: scoreHindiVoice(v, lang) }))
          .filter((v) => v.score > 0)
          .sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
          utterance.voice = scored[0].voice;
          voiceCacheRef.current.set(lang, scored[0].voice);
        }
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        chunkIndex++;
        if (chunkIndex < chunks.length) {
          speakChunk();
        } else {
          setIsSpeaking(false);
        }
      };
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    };

    speakChunk();
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  return {
    isListening,
    isSpeaking,
    transcript,
    finalTranscript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    supported,
    availableVoices,
  };
}

/**
 * Split text into smaller chunks for TTS.
 * Chrome has a ~15s utterance limit; we split on sentence boundaries.
 */
function splitTextForTTS(text: string, maxLength = 150): string[] {
  if (text.length <= maxLength) return [text];

  const sentences = text.split(/(?<=[।.!?\n])\s*/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLength && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}
