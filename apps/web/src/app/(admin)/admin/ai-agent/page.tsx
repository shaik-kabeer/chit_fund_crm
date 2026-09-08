'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSpeech } from '@/hooks/use-speech';
import { api } from '@/lib/api';

type SpeechLang = 'hi-IN' | 'ur-PK' | 'en-IN';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  action?: string;
  data?: any;
  pending?: boolean;
  needsConfirmation?: boolean;
  params?: Record<string, any>;
}

const LANGUAGES: { value: SpeechLang; label: string; flag: string }[] = [
  { value: 'hi-IN', label: 'Hindi', flag: '🇮🇳' },
  { value: 'ur-PK', label: 'Urdu', flag: '🇵🇰' },
  { value: 'en-IN', label: 'English', flag: '🇬🇧' },
];

function DataCard({ action, data }: { action?: string; data?: any }) {
  if (!data || !action) return null;

  if (action === 'get_dashboard_stats') {
    const d = data;
    const collected = Number(d.collectedThisMonth || 0) / 100;
    return (
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-blue-50 rounded-lg p-2"><span className="text-gray-500">Active Groups</span><br /><span className="font-bold text-lg">{d.activeGroups}</span></div>
        <div className="bg-green-50 rounded-lg p-2"><span className="text-gray-500">Total Customers</span><br /><span className="font-bold text-lg">{d.totalCustomers}</span></div>
        <div className="bg-purple-50 rounded-lg p-2"><span className="text-gray-500">This Month</span><br /><span className="font-bold text-lg">₹{collected.toLocaleString('en-IN')}</span></div>
        <div className="bg-amber-50 rounded-lg p-2"><span className="text-gray-500">Pending</span><br /><span className="font-bold text-lg">{d.pendingPayments}</span></div>
        <div className="bg-red-50 rounded-lg p-2"><span className="text-gray-500">Overdue</span><br /><span className="font-bold text-lg">{d.overdueInstallments}</span></div>
        <div className="bg-orange-50 rounded-lg p-2"><span className="text-gray-500">Defaulting</span><br /><span className="font-bold text-lg">{d.defaultingMembers}</span></div>
      </div>
    );
  }

  if (action === 'get_pending_payments') {
    const items = data?.data || [];
    if (!items.length) return null;
    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead><tr className="bg-gray-50"><th className="text-left p-2 border-b">Customer</th><th className="text-left p-2 border-b">Group</th><th className="text-left p-2 border-b">Month</th><th className="text-right p-2 border-b">Amount</th><th className="text-left p-2 border-b">Method</th></tr></thead>
          <tbody>
            {items.map((p: any, i: number) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="p-2 font-medium">{p.installment?.member?.customer?.name || '-'}</td>
                <td className="p-2">{p.installment?.member?.group?.groupNumber || '-'} <span className="text-gray-400">({p.installment?.member?.group?.product?.name || ''})</span></td>
                <td className="p-2">Month {p.installment?.monthNumber}</td>
                <td className="p-2 text-right font-medium">₹{(Number(p.amountPaise) / 100).toLocaleString('en-IN')}</td>
                <td className="p-2">{p.method}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (action === 'get_pending_memberships') {
    const items = Array.isArray(data) ? data : [];
    if (!items.length) return null;
    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead><tr className="bg-gray-50"><th className="text-left p-2 border-b">Customer</th><th className="text-left p-2 border-b">Phone</th><th className="text-left p-2 border-b">Group</th><th className="text-left p-2 border-b">KYC</th></tr></thead>
          <tbody>
            {items.map((m: any, i: number) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="p-2 font-medium">{m.customer?.name || '-'}</td>
                <td className="p-2">{m.customer?.phone || '-'}</td>
                <td className="p-2">{m.group?.groupNumber} ({m.group?.product?.name})</td>
                <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-xs ${m.customer?.kycStatus === 'VERIFIED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{m.customer?.kycStatus}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (action === 'search_customers') {
    const items = data?.data || [];
    if (!items.length) return null;
    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead><tr className="bg-gray-50"><th className="text-left p-2 border-b">Name</th><th className="text-left p-2 border-b">Phone</th><th className="text-left p-2 border-b">KYC</th><th className="text-left p-2 border-b">Active</th><th className="text-right p-2 border-b">Groups</th></tr></thead>
          <tbody>
            {items.map((c: any, i: number) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="p-2 font-medium">{c.name}</td>
                <td className="p-2">{c.phone}</td>
                <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-xs ${c.kycStatus === 'VERIFIED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{c.kycStatus}</span></td>
                <td className="p-2">{c.isActive ? 'Yes' : 'No'}</td>
                <td className="p-2 text-right">{c._count?.memberships ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (action === 'list_groups') {
    const items = Array.isArray(data) ? data : [];
    if (!items.length) return null;
    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead><tr className="bg-gray-50"><th className="text-left p-2 border-b">Group</th><th className="text-left p-2 border-b">Product</th><th className="text-left p-2 border-b">Status</th><th className="text-right p-2 border-b">Seats</th><th className="text-right p-2 border-b">Value</th></tr></thead>
          <tbody>
            {items.map((g: any, i: number) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="p-2 font-medium">{g.groupNumber}</td>
                <td className="p-2">{g.product?.name}</td>
                <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-xs ${g.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : g.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>{g.status}</span></td>
                <td className="p-2 text-right">{g.filledSeats}/{g.totalSeats}</td>
                <td className="p-2 text-right">₹{(Number(g.product?.chitValuePaise || 0) / 100).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (action === 'get_unpaid_members') {
    const groups = data?.groups || [];
    if (!groups.length) return null;
    return (
      <div className="mt-3 space-y-4">
        {groups.filter((g: any) => g.unpaidMembers.length > 0).map((g: any, gi: number) => (
          <div key={gi} className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
              <span className="font-semibold text-sm">{g.groupNumber} <span className="text-gray-400 font-normal">({g.product})</span></span>
              <span className="text-xs text-gray-500">Month {g.currentMonth} | {g.unpaidMembers.length} unpaid</span>
            </div>
            <table className="w-full text-xs border-collapse">
              <thead><tr className="bg-gray-50/50"><th className="text-left p-2 border-b">Customer</th><th className="text-left p-2 border-b">Phone</th><th className="text-left p-2 border-b">Ticket</th><th className="text-left p-2 border-b">Unpaid Months</th><th className="text-right p-2 border-b">Pending</th></tr></thead>
              <tbody>
                {g.unpaidMembers.map((m: any, mi: number) => (
                  <tr key={mi} className="border-b border-gray-100">
                    <td className="p-2 font-medium">{m.name}</td>
                    <td className="p-2">{m.phone}</td>
                    <td className="p-2">{m.seatLabel || `#${m.ticketNumber}`}</td>
                    <td className="p-2">
                      {m.unpaidMonths.map((um: any) => (
                        <span key={um.month} className={`inline-block mr-1 mb-1 px-1.5 py-0.5 rounded text-xs ${um.status === 'OVERDUE' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {um.monthLabel || `M${um.month}`}
                        </span>
                      ))}
                    </td>
                    <td className="p-2 text-right font-semibold text-red-600">₹{(Number(m.totalPendingPaise) / 100).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

  if (action === 'get_all_customers') {
    const items = data?.data || [];
    if (!items.length) return null;
    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead><tr className="bg-gray-50"><th className="text-left p-2 border-b">Name</th><th className="text-left p-2 border-b">Phone</th><th className="text-left p-2 border-b">KYC</th><th className="text-left p-2 border-b">Active</th><th className="text-right p-2 border-b">Groups</th></tr></thead>
          <tbody>
            {items.map((c: any, i: number) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="p-2 font-medium">{c.name}</td>
                <td className="p-2">{c.phone}</td>
                <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-xs ${c.kycStatus === 'VERIFIED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{c.kycStatus}</span></td>
                <td className="p-2">{c.isActive ? 'Yes' : 'No'}</td>
                <td className="p-2 text-right">{c._count?.memberships ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

export default function AIAgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [language, setLanguage] = useState<SpeechLang>('hi-IN');
  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isListening, isSpeaking, transcript, finalTranscript, startListening, stopListening, speak, stopSpeaking, supported } = useSpeech();
  const sendingRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const doSend = useCallback(async (text: string) => {
    if (!text.trim() || sendingRef.current) return;

    sendingRef.current = true;
    setIsProcessing(true);
    setTextInput('');

    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', text: text.trim() };
    const pendingMsg: Message = { id: `pending-${Date.now()}`, role: 'assistant', text: '...', pending: true };

    setMessages((prev) => [...prev, userMsg, pendingMsg]);

    try {
      const history = messagesRef.current.slice(-10).map((m) => ({
        role: m.role,
        content: m.text,
      }));

      const res = (await api.post('/ai/chat', { text: text.trim(), language, history })) as {
        responseText?: string;
        action?: string;
        data?: any;
        needsConfirmation?: boolean;
        params?: Record<string, any>;
      };

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: res.responseText || 'No response',
        action: res.action,
        data: res.data,
        needsConfirmation: res.needsConfirmation,
        params: res.params,
      };

      setMessages((prev) => prev.filter((m) => !m.pending).concat(assistantMsg));

      if (autoSpeak && res.responseText) {
        speak(res.responseText, language);
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.filter((m) => !m.pending).concat({
          id: `error-${Date.now()}`,
          role: 'assistant',
          text: err?.message || 'Something went wrong',
        }),
      );
    } finally {
      setIsProcessing(false);
      sendingRef.current = false;
    }
  }, [language, autoSpeak, speak]);

  useEffect(() => {
    if (finalTranscript) {
      doSend(finalTranscript);
    }
  }, [finalTranscript, doSend]);

  const handleMicClick = () => {
    if (isSpeaking) { stopSpeaking(); return; }
    if (isListening) { stopListening(); } else { startListening(language); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend(textInput);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stash AI Assistant</h1>
          <p className="text-sm text-gray-500 mt-1">Voice-powered chit fund management — speak in Hindi, Urdu, or English</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} className="rounded border-gray-300" />
            Auto-speak
          </label>
          <select value={language} onChange={(e) => setLanguage(e.target.value as SpeechLang)} className="border rounded-lg px-3 py-2 text-sm bg-white">
            {LANGUAGES.map((l) => (<option key={l.value} value={l.value}>{l.flag} {l.label}</option>))}
          </select>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
              <svg className="w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-gray-600">Click the mic or type a command</p>
              <div className="mt-3 flex flex-wrap gap-2 justify-center max-w-lg">
                {['Kitne customers hain?', 'Unpaid list dikhao', 'Dashboard stats batao', 'Sab groups dikhao', 'Pending requests dikhao'].map((hint) => (
                  <button key={hint} onClick={() => doSend(hint)} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-full transition">
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === 'user' ? 'bg-blue-600 text-white'
                : msg.pending ? 'bg-gray-100 text-gray-400'
                  : 'bg-white border border-gray-200 text-gray-800 shadow-sm'
            }`}>
              {msg.pending ? (
                <div className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                  <DataCard action={msg.action} data={msg.data} />
                  {msg.action && msg.action !== 'none' && msg.action !== 'clarify' && (
                    <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded">{msg.action.replace(/_/g, ' ')}</span>
                  )}
                  {msg.needsConfirmation && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => doSend('Haan, karo')} className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition">Haan / Yes</button>
                      <button onClick={() => doSend('Nahi, mat karo')} className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition">Nahi / No</button>
                    </div>
                  )}
                  {msg.role === 'assistant' && !msg.pending && (
                    <button onClick={() => speak(msg.text, language)} className="mt-2 text-xs text-gray-400 hover:text-blue-500 transition" title="Speak this message">
                      <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                      Replay
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {isListening && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-blue-100 text-blue-700 italic text-sm">
              {transcript || 'Listening...'}
            </div>
          </div>
        )}
      </div>

      <div className="border-t pt-4 flex items-center gap-3">
        <button
          onClick={handleMicClick}
          disabled={isProcessing}
          className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition-all ${
            isListening ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-200'
              : isSpeaking ? 'bg-purple-500 text-white animate-pulse shadow-lg shadow-purple-200'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
          } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={isListening ? 'Stop listening' : isSpeaking ? 'Stop speaking' : 'Start listening'}
        >
          {isListening ? (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          ) : isSpeaking ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
          )}
        </button>

        <div className="flex-1 relative">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? 'Listening...' : 'Type ya bolo... (e.g. "Pending payments dikhao")'}
            disabled={isProcessing || isListening}
            className="w-full border rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button onClick={() => doSend(textInput)} disabled={!textInput.trim() || isProcessing}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 hover:text-blue-700 disabled:text-gray-300 disabled:cursor-not-allowed transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>

      {!supported && (
        <p className="text-xs text-amber-600 mt-2">Voice input not supported in this browser. Use Chrome or Edge for voice features.</p>
      )}
    </div>
  );
}
