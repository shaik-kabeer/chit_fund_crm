import { NextResponse } from 'next/server';
import { requireStaff } from '@/server/auth';
import { handleRouteError } from '@/server/http';
import { callLLM } from '@/lib/ai-providers';
import {
  executeAction,
  isMutationAction,
  getSystemPrompt,
  formatResultForSpeech,
} from '@/server/services/ai-agent.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: Request) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN']);

    const body = await request.json();
    const { text, language = 'hi-IN', history = [] } = body as {
      text: string;
      language: string;
      history: ChatMessage[];
    };

    if (!text?.trim()) {
      return NextResponse.json({ message: 'Text is required' }, { status: 400 });
    }

    const systemPrompt = getSystemPrompt();
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.slice(-10).map((m: ChatMessage) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: text },
    ];

    const llmResult = await callLLM(messages);

    let parsed: {
      action: string;
      params: Record<string, any>;
      needsConfirmation: boolean;
      confirmed: boolean;
      responseText: string;
    };

    try {
      parsed = JSON.parse(llmResult.content);
    } catch {
      return NextResponse.json({
        responseText: llmResult.content,
        action: 'none',
        data: null,
        provider: llmResult.provider,
      });
    }

    if (parsed.action === 'none' || parsed.action === 'clarify') {
      return NextResponse.json({
        responseText: parsed.responseText,
        action: parsed.action,
        data: null,
        needsConfirmation: false,
        provider: llmResult.provider,
      });
    }

    if (isMutationAction(parsed.action) && parsed.needsConfirmation && !parsed.confirmed) {
      return NextResponse.json({
        responseText: parsed.responseText,
        action: parsed.action,
        params: parsed.params,
        needsConfirmation: true,
        data: null,
        provider: llmResult.provider,
      });
    }

    const result = await executeAction(parsed.action, parsed.params, {
      orgId: user.orgId,
      userId: user.id,
    });

    let responseText = parsed.responseText;
    if (result.success) {
      const formatted = formatResultForSpeech(parsed.action, result.data, language);
      if (formatted) responseText = formatted;
    } else {
      responseText = result.error || (language.startsWith('hi')
        ? 'Kuch galat ho gaya, dobara try karein.'
        : 'Something went wrong, please try again.');
    }

    return NextResponse.json({
      responseText,
      action: parsed.action,
      data: result.success ? result.data : null,
      success: result.success,
      error: result.error,
      provider: llmResult.provider,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
