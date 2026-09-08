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
}

const SpeechRecognition =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export function useSpeech(): UseSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  const supported = typeof window !== 'undefined' && !!SpeechRecognition && !!window.speechSynthesis;

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
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

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.95;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang === lang || v.lang.startsWith(lang.split('-')[0]),
    );
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
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
  };
}
