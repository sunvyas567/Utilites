// Declare experimental globals for browser Speech and AI APIs
declare global {
  var LanguageModel: any;
  interface Window {
    ai?: any;
    LanguageModel?: any;
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { 
  Mic, MicOff, Sparkles, Building2, CheckCircle2, 
  Bold, Italic, List, ListOrdered, Smile, Eye, Lock, 
  Globe, ExternalLink, Key, Link as LinkIcon, Image as ImageIcon, Download, Copy, EyeOff
} from 'lucide-react';

const LINKEDIN_MAX_CHARS = 3000;
const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8000';

type VariantDetails = {
  provider: string;
  model?: string;
  success: boolean;
  error?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  rateLimit?: Record<string, string | number | null>;
  params?: {
    temperature?: number;
    max_tokens?: number;
  };
  timeMs?: number;
};

type VariantOption = {
  id: string;
  title: string;
  badge: string;
  contentHtml: string;
  details?: VariantDetails;
};

type BrowserAiResult = {
  text: string;
  details: VariantDetails;
};

type CloudAiResult = {
  text: string;
  details: VariantDetails;
};

const MEETING_CONTEXTS = [
  { id: 'post_event', label: 'After an event / conference', hint: 'Share a key takeaway, observation, or connection from the event.' },
  { id: 'before_event', label: 'Before an event / conference', hint: 'Create anticipation, invite conversations, or share what you expect to learn.' },
  { id: 'prospect_meeting', label: 'After a prospect meeting', hint: 'Turn meeting notes into a useful, non-pushy professional update.' },
  { id: 'customer_meeting', label: 'After a customer meeting', hint: 'Capture customer-focused learnings, outcomes, or appreciation.' },
  { id: 'product_service', label: 'Product / service promotion', hint: 'Explain value clearly without sounding like a hard sales pitch.' },
  { id: 'general_audience', label: 'Selling to a general audience', hint: 'Make the message broadly relevant and action-oriented.' },
  { id: 'thought_leadership', label: 'Thought leadership / industry insight', hint: 'Turn an observation, trend, or opinion into a credible point of view.' },
  { id: 'success_story', label: 'Customer success / case study', hint: 'Share a problem, approach, outcome, and lesson while protecting confidentiality.' },
  { id: 'new_connection', label: 'New connection / relationship building', hint: 'Start or deepen a professional conversation without an overt pitch.' },
  { id: 'after_demo', label: 'After a demo / product presentation', hint: 'Share a practical lesson, customer problem, or product insight without revealing confidential details.' },
  { id: 'sales_followup', label: 'Sales follow-up / nurture', hint: 'Keep the conversation useful and relevant rather than making a direct sales pitch.' },
  { id: 'webinar', label: 'Webinar / virtual session', hint: 'Share a learning, audience question, or invitation to continue the conversation.' },
  { id: 'hiring_team', label: 'Hiring / team update', hint: 'Share hiring news, team growth, culture, or an open role.' },
  { id: 'company_update', label: 'Company / business update', hint: 'Announce a milestone, partnership, launch, or business development.' },
  { id: 'general', label: 'General / other', hint: 'Use your notes and let AI determine the best structure.' },
];

// Available Cloud Providers and models
const CLOUD_PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', defaultModel: 'gemini-2.5-flash', models: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'] },
  { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o-mini', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'] },
  { id: 'anthropic', name: 'Anthropic Claude', defaultModel: 'claude-3-5-sonnet-20241022', models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'] },
];

const toUnicodeBold = (str: string): string => {
  return str.replace(/[A-Za-z0-9]/g, (char) => {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d5d4 + (code - 65));
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d5ee + (code - 97));
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1d7ec + (code - 48));
    return char;
  });
};

const toUnicodeItalic = (str: string): string => {
  return str.replace(/[A-Za-z]/g, (char) => {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d434 + (code - 65));
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d44e + (code - 97));
    return char;
  });
};

const convertHtmlToLinkedInText = (html: string): string => {
  if (!html) return '';
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  tempDiv.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href) a.textContent = ` ${href} `;
  });

  tempDiv.querySelectorAll('img').forEach((img) => img.remove());

  tempDiv.querySelectorAll('strong, b').forEach((node) => {
    node.textContent = toUnicodeBold(node.textContent || '');
  });
  tempDiv.querySelectorAll('em, i').forEach((node) => {
    node.textContent = toUnicodeItalic(node.textContent || '');
  });

  tempDiv.querySelectorAll('li').forEach((li) => {
    const parent = li.parentElement;
    if (parent && parent.tagName === 'OL') {
      const index = Array.from(parent.children).indexOf(li) + 1;
      li.textContent = `   ${index}. ${li.textContent?.trim()}\n`;
    } else {
      li.textContent = `   • ${li.textContent?.trim()}\n`;
    }
  });

  tempDiv.querySelectorAll('p, h1, h2, h3').forEach((block) => {
    block.append('\n\n');
  });

  return (tempDiv.textContent || tempDiv.innerText || '').trim().slice(0, LINKEDIN_MAX_CHARS);
};

const formatToHtml = (rawText: string, isListVariant: boolean): string => {
  if (!rawText) return '';
  
  const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const htmlBlocks: string[] = [];
  let currentListItems: string[] = [];

  const flushList = () => {
    if (currentListItems.length > 0) {
      const listHtml = `<ul style="margin: 8px 0; padding-left: 20px;">` +
        currentListItems.map((item) => `<li style="margin-bottom: 6px;">${item}</li>`).join('') +
        `</ul>`;
      htmlBlocks.push(listHtml);
      currentListItems = [];
    }
  };

  const bulletRegex = /^([•\-*▪🔹▸▶⚡✅◈]|\d+[\.\)])\s*/;

  for (const line of lines) {
    const isBulletLine = bulletRegex.test(line);

    if (isListVariant && isBulletLine) {
      const cleanItem = line.replace(bulletRegex, '').trim();
      if (cleanItem) currentListItems.push(cleanItem);
    } else {
      flushList();
      htmlBlocks.push(`<p style="margin-bottom: 10px;">${line}</p>`);
    }
  }

  flushList();
  return htmlBlocks.join('');
};

export type BrowserAiAvailability =
  | 'checking'
  | 'ready'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'unsupported'
  | 'error';

export type BrowserAiCheckResult = {
  status: BrowserAiAvailability;
  message: string;
  availability?: string;
};

export async function checkBrowserAiAvailability(): Promise<BrowserAiCheckResult> {
  try {
    const globalLM = typeof LanguageModel !== 'undefined'
      ? LanguageModel
      : (typeof window !== 'undefined' ? (window as any).LanguageModel : undefined);

    if (globalLM) {
      if (typeof globalLM.availability === 'function') {
        const availability = await globalLM.availability();

        if (availability === 'available' || availability === 'readily') {
          return { status: 'ready', message: 'Local AI is available.', availability };
        }

        if (availability === 'downloadable') {
          return {
            status: 'downloadable',
            message: 'Local AI is supported, but the local model needs to be prepared.',
            availability,
          };
        }

        if (availability === 'downloading') {
          return {
            status: 'downloading',
            message: 'Local AI is preparing the local model.',
            availability,
          };
        }

        return {
          status: 'unavailable',
          message: 'Local AI is not available on this browser or device.',
          availability,
        };
      }

      return {
        status: 'ready',
        message: 'A supported local AI API is available.',
        availability: 'readily',
      };
    }

    const aiObj = typeof window !== 'undefined'
      ? ((window as any).ai || (navigator as any).ai)
      : null;

    if (aiObj?.languageModel) {
      if (typeof aiObj.languageModel.capabilities === 'function') {
        const caps = await aiObj.languageModel.capabilities();
        const available = caps?.available;

        if (available === 'readily') {
          return { status: 'ready', message: 'Local AI is available.', availability: available };
        }

        if (available === 'after-download' || available === 'downloadable') {
          return {
            status: 'downloadable',
            message: 'Local AI is supported, but the local model needs to be prepared.',
            availability: available,
          };
        }

        return {
          status: 'unavailable',
          message: 'Local AI is not available on this browser or device.',
          availability: available,
        };
      }

      return {
        status: 'ready',
        message: 'A supported local AI API is available.',
        availability: 'readily',
      };
    }

    return {
      status: 'unsupported',
      message: 'This browser does not expose a supported local AI API.',
    };
  } catch (err: any) {
    console.warn('Local AI availability check failed:', err);
    return {
      status: 'error',
      message: err?.message || 'Local AI could not be checked.',
    };
  }
}

export async function getBrowserAiSession(
  onDownloadProgress?: (progress: number) => void
): Promise<any | null> {
  try {
    const globalLM = typeof LanguageModel !== 'undefined'
      ? LanguageModel
      : (typeof window !== 'undefined' ? (window as any).LanguageModel : undefined);

    if (globalLM) {
      const availability = typeof globalLM.availability === 'function'
        ? await globalLM.availability()
        : 'readily';

      if (
        availability === 'no' ||
        availability === 'unavailable' ||
        availability === 'unsupported'
      ) {
        return null;
      }

      if (typeof globalLM.create === 'function') {
        const monitor = (monitorObj: any) => {
          try {
            monitorObj?.addEventListener?.('downloadprogress', (event: any) => {
              const progress = Number(event?.loaded ?? event?.progress ?? 0);
              if (Number.isFinite(progress)) {
                onDownloadProgress?.(progress <= 1 ? progress * 100 : progress);
              }
            });
          } catch (monitorError) {
            console.warn('Local AI download monitor unavailable:', monitorError);
          }
        };

        return await globalLM.create({ monitor });
      }
    }

    const aiObj = typeof window !== 'undefined'
      ? ((window as any).ai || (navigator as any).ai)
      : null;

    if (aiObj?.languageModel) {
      const caps = typeof aiObj.languageModel.capabilities === 'function'
        ? await aiObj.languageModel.capabilities()
        : null;

      if (
        caps &&
        caps.available !== 'readily' &&
        caps.available !== 'after-download' &&
        caps.available !== 'downloadable'
      ) {
        return null;
      }

      return await aiObj.languageModel.create();
    }
  } catch (err) {
    console.warn('Failed to initialize local AI:', err);
  }

  return null;
}

export function getBrowserAiModelName(): string {
  if (typeof window === 'undefined') return 'Local AI';

  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('chrome') || userAgent.includes('chromium') || userAgent.includes('edg')) {
    return 'Gemini Nano';
  }
  if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
    return 'Apple Intelligence / Local LLM';
  }
  if (userAgent.includes('firefox')) {
    return 'Firefox Local AI';
  }

  return 'Local AI';
}

const isGeneralGoal = (goal: string) => goal === 'General / Custom' || goal === 'General / Context';

const buildGenerationPrompt = (
  topicText: string,
  goal: string,
  tone: string,
  styleFormat: 'story' | 'list',
  meetingContextId: string = 'general'
): string => {
  const goalPrompt = isGeneralGoal(goal) ? 'update' : `${goal} post`;
  const tonePrompt = tone === 'General / Custom' ? 'authentic' : tone;

  const meeting = MEETING_CONTEXTS.find((item) => item.id === meetingContextId) || MEETING_CONTEXTS[MEETING_CONTEXTS.length - 1];

  const formatInstructions = styleFormat === 'story'
    ? 'Write in clear narrative paragraph form with strong hook sentences. Do not use bullet points. Make it polished, complete, and easy to read. Include a strong opening, meaningful middle, and natural conclusion.'
    : 'Format the post as a polished list-driven LinkedIn update with one opening paragraph, then 3 short takeaway bullets starting with "🔹 ", and a concise closing line. Make it feel complete and professional.';

  return `Write one high-converting LinkedIn ${goalPrompt}.
Tone: ${tonePrompt}.
Context / Key Points: ${topicText || 'General industry insight'}.
Situation / Sales Context: ${meeting.label}.
Guidance for this situation: ${meeting.hint}
Formatting Rule: ${formatInstructions}
Keep the post crisp and useful, around 120-220 words. Return plain text only, without commentary or labels.`;
};

export const generateWithBrowserAi = async (
  topicText: string,
  goal: string,
  tone: string,
  styleFormat: 'story' | 'list',
  onChunk?: (text: string) => void
): Promise<BrowserAiResult> => {
  const prompt = buildGenerationPrompt(topicText, goal, tone, styleFormat);
  const start = performance.now();

  const details: VariantDetails = {
    provider: 'browser',
    success: false,
    params: { temperature: 0.7, max_tokens: 1200 },
    timeMs: 0,
  };

  try {
    const session = await getBrowserAiSession();
    if (!session) {
      details.error = 'Local AI session is unavailable.';
      return { text: '', details };
    }

    let result: any = null;
    let accumulated = '';

    // Prefer browser-native streaming when available.
    if (typeof session.promptStreaming === 'function') {
      const stream = await session.promptStreaming(prompt);
      for await (const chunk of stream as any) {
        const piece = typeof chunk === 'string'
          ? chunk
          : typeof chunk?.text === 'string'
          ? chunk.text
          : typeof chunk?.outputText === 'string'
          ? chunk.outputText
          : typeof chunk?.content === 'string'
          ? chunk.content
          : typeof chunk?.delta === 'string'
          ? chunk.delta
          : '';

        if (piece) {
          accumulated += piece;
          onChunk?.(accumulated);
        }

        if (chunk?.usage) details.usage = chunk.usage;
        if (chunk?.model || chunk?.modelId) details.model = chunk.model || chunk.modelId;
      }
      result = accumulated;
    } else if (typeof session.prompt === 'function') {
      result = await session.prompt(prompt);
    } else if (typeof session.generateContent === 'function') {
      result = await session.generateContent(prompt);
    }

    const end = performance.now();
    details.timeMs = Math.round(end - start);

    const text = typeof result === 'string'
      ? result
      : typeof result?.text === 'string'
      ? result.text
      : typeof result?.outputText === 'string'
      ? result.outputText
      : typeof result?.content === 'string'
      ? result.content
      : accumulated;

    details.model = result?.model || result?.modelId || result?.provider || details.model || 'browser';
    details.usage = result?.usage || result?.usageStats || result?.tokenUsage || details.usage || undefined;
    details.rateLimit = result?.rate_limit || result?.rateLimit || undefined;
    details.success = Boolean(text?.trim());
    if (!details.success) {
      details.error = result?.error || result?.message || 'Local AI returned no text.';
    }

    return { text: text.trim(), details };
  } catch (error: any) {
    const end = performance.now();
    details.timeMs = Math.round(end - start);
    details.error = error?.message || String(error);
    return { text: '', details };
  }
};

export default function LinkedInWorkspace() {
  const [showAuthConfig, setShowAuthConfig] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selectedTone, setSelectedTone] = useState<string>('Conversational');
  const [meetingContext, setMeetingContext] = useState<string>('general');
  
  // Cloud Provider & API Key States
  const [cloudProvider, setCloudProvider] = useState<string>('gemini');
  const [cloudModel, setCloudModel] = useState<string>('gemini-2.5-flash');
  const [cloudApiKey, setCloudApiKey] = useState<string>('');
  const [customProvider, setCustomProvider] = useState<string>('');
  const [customModel, setCustomModel] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const [generationStage, setGenerationStage] = useState<string>('');
  const [browserAiStatus, setBrowserAiStatus] = useState<BrowserAiAvailability>('checking');
  const [browserAiMessage, setBrowserAiMessage] = useState<string>('Checking local AI...');
  const [browserAiDownloadProgress, setBrowserAiDownloadProgress] = useState<number>(0);
  const [showBrowserAiHelp, setShowBrowserAiHelp] = useState<boolean>(false);
  // Automatic = use local AI when available, otherwise Demo Mode Server AI.
  const [aiMode, setAiMode] = useState<'auto' | 'cloud' | 'demo'>('auto');
  const [demoAvailable, setDemoAvailable] = useState<boolean>(false);
  const [demoProviders, setDemoProviders] = useState<string[]>([]);
  const useBrowserAi = aiMode === 'auto';
  const [generationMode, setGenerationMode] = useState<'idle' | 'browser' | 'cloud' | 'template'>('idle');

  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const basePromptRef = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [editorHtml, setEditorHtml] = useState('');
  const [plainText, setPlainText] = useState('');
  const [attachedImageUrl, setAttachedImageUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const tonesList = ['General / Custom','Conversational', 'Authoritative', 'Technical' ];
  const emojiAndSymbolsList = ['🔹', '▸', '▪', '✅', '⚡', '🚀', '💡', '📈', '🔥', '💬'];

  // Handle Provider Change
  const handleProviderChange = (providerId: string) => {
    setCloudProvider(providerId);
    const matched = CLOUD_PROVIDERS.find((p) => p.id === providerId);
    if (matched) {
      setCloudModel(matched.defaultModel);
    } else {
      setCloudModel('');
    }
  };

  const effectiveProvider = cloudProvider === 'custom' ? customProvider.trim() : cloudProvider;
  const effectiveModel = cloudProvider === 'custom' ? customModel.trim() : cloudModel;

  const detectGoalFromPrompt = (text: string): string => {
    const normalized = text.toLowerCase();
    if (!normalized.trim()) return 'General / Context';
    if (/(product|launch|release|go-to-market|offer|solution)/.test(normalized)) return 'Product Launch';
    if (/(architecture|platform|service|api|scalable|infrastructure|technical)/.test(normalized)) return 'Technical Architecture';
    if (/(thought leadership|insight|opinion|trend|future of|industry)/.test(normalized)) return 'Thought Leadership';
    if (/(hiring|recruit|team|join us|talent|role)/.test(normalized)) return 'Hiring';
    return 'General / Context';
  };

  const detectToneFromPrompt = (text: string): string => {
    const normalized = text.toLowerCase();
    if (/(architecture|platform|api|technical|build|engineer|developer)/.test(normalized)) return 'Technical';
    if (/(enterprise|trusted|secure|proven|authority|strategy|confidence)/.test(normalized)) return 'Authoritative';
    return 'Conversational';
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/v1/llm/config`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Config check failed (${response.status})`)))
      .then((config) => {
        if (!cancelled) {
          setDemoAvailable(Boolean(config?.demo_available));
          setDemoProviders(Array.isArray(config?.demo_providers) ? config.demo_providers : []);
        }
      })
      .catch((error) => {
        console.warn('Demo AI capability check failed:', error);
        if (!cancelled) setDemoAvailable(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript;
        }
        const prefix = basePromptRef.current ? `${basePromptRef.current.trim()} ` : '';
        setPrompt(prefix + fullTranscript);
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      setStatusMessage({ type: 'error', text: 'Voice input is not supported in this browser. Try Chrome or Edge.' });
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        basePromptRef.current = prompt;
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error("Speech recognition start failed:", err);
      }
    }
  };

  const initialContent = `<p>🚀 <strong>Exciting Milestone Ahead!</strong></p><p>We are modernizing our architecture to support real-time data processing and zero token overhead.</p>`;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder: 'Dictate notes or generate draft content...' }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { style: 'color: #0066c2; text-decoration: underline; font-weight: 600;' },
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: { style: 'max-width: 100%; border-radius: 8px; margin: 12px 0; border: 1px solid #cbd5e1;' },
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      const rawHtml = editor.getHTML();
      setEditorHtml(rawHtml);
      setPlainText(convertHtmlToLinkedInText(rawHtml));
    },
  });

  useEffect(() => {
    if (editor && !editorHtml) {
      setEditorHtml(initialContent);
      setPlainText(convertHtmlToLinkedInText(initialContent));
    }
  }, [editor]);

  const checkBrowserAi = async (startModelDownload = false) => {
    setBrowserAiStatus('checking');
    setBrowserAiMessage('Checking local AI...');
    setBrowserAiDownloadProgress(0);

    const result = await checkBrowserAiAvailability();

    // Give users a useful explanation on browsers that do not expose
    // a supported local AI API (for example Safari and Firefox).
    if (result.status === 'unsupported') {
      const ua = navigator.userAgent;
      const browserName = /Firefox/i.test(ua)
        ? 'Firefox'
        : /Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua)
        ? 'Safari'
        : /Edg/i.test(ua)
        ? 'Edge'
        : /Chrome|Chromium/i.test(ua)
        ? 'Chrome'
        : 'this browser';

      const unsupportedMessage =
        `Local AI is not available in ${browserName}. ` +
        `Automatic mode will use Demo Mode Server AI instead.`;

      setBrowserAiStatus('unsupported');
      setBrowserAiMessage(unsupportedMessage);
      setShowBrowserAiHelp(true);
      setStatusMessage({
        type: 'info',
        text: `${browserName} does not currently support local AI. Demo Mode Server AI fallback is available.`
      });
      return;
    }

    setBrowserAiStatus(result.status);
    setBrowserAiMessage(result.message);

    if (startModelDownload && (result.status === 'downloadable' || result.status === 'downloading')) {
      setBrowserAiStatus('downloading');
      setBrowserAiMessage('Local AI is being prepared...');
      try {
        await getBrowserAiSession((progress) => {
          setBrowserAiDownloadProgress(Math.round(Math.max(0, Math.min(100, progress))));
        });
        const ready = await checkBrowserAiAvailability();
        setBrowserAiStatus(ready.status === 'ready' ? 'ready' : ready.status);
        setBrowserAiMessage(
          ready.status === 'ready'
            ? 'Local AI is available.'
            : ready.message
        );
      } catch (err: any) {
        setBrowserAiStatus('error');
        setBrowserAiMessage(err?.message || 'Local AI model setup failed.');
      }
    }
  };

  useEffect(() => {
    void checkBrowserAi(false);
  }, []);

  const handleAddLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter or paste URL:', previousUrl || 'https://');

    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetMark('link').run();
      return;
    }
    const { from, to } = editor.state.selection;
    if (from === to) {
      editor.chain().focus().insertContent(`<a href="${url.trim()}">${url.trim()}</a> `).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setMark('link', { href: url.trim() }).run();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      editor.chain().focus().insertContent({ type: 'image', attrs: { src: result } }).run();
      setAttachedImageUrl(result);
      setStatusMessage({ type: 'success', text: '📷 Image attached to post canvas!' });
    };
    reader.readAsDataURL(file);
  };

  const copyImageToClipboard = async () => {
    if (!attachedImageUrl) return;
    try {
      const response = await fetch(attachedImageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setStatusMessage({ type: 'success', text: '🖼️ Image copied to clipboard!' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Browser prevented direct image copy. Use Download instead.' });
    }
  };

  const handleManualPost = async () => {
    if (!plainText) {
      setStatusMessage({ type: 'error', text: 'Draft content cannot be empty.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(plainText);
      setStatusMessage({ type: 'success', text: '📋 Draft copied! Redirecting to LinkedIn...' });
      setTimeout(() => { window.open('https://www.linkedin.com/feed/', '_blank'); }, 700);
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Clipboard copy failed.' });
    }
  };

  const updateGenerationProgress = (progress: number, stage: string) => {
    setGenerationProgress(Math.max(0, Math.min(100, progress)));
    setGenerationStage(stage);
  };

  const generateMultiVariants = async () => {
    setIsGenerating(true);
    setVariants([]);
    updateGenerationProgress(5, 'Preparing AI generation...');
    const contextText = prompt.trim() || 'General Corporate Update';
    const computedGoal = detectGoalFromPrompt(contextText);
    const computedTone = selectedTone === 'Conversational' ? detectToneFromPrompt(contextText) : selectedTone;

    if (aiMode === 'demo' && !demoAvailable) {
      setStatusMessage({ type: 'error', text: 'Demo Mode is not available because the server-side AI provider is not configured.' });
      setIsGenerating(false);
      setGenerationProgress(0);
      setGenerationStage('');
      return;
    }

    if (aiMode === 'cloud' && !cloudApiKey.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter your API key for Cloud AI, or select Demo Mode to use the server-side key.' });
      setIsGenerating(false);
      setGenerationProgress(0);
      setGenerationStage('');
      return;
    }

    if (cloudProvider === 'custom' && (!customProvider.trim() || !customModel.trim())) {
      setStatusMessage({ type: 'error', text: 'Please enter both a custom AI provider and model.' });
      setIsGenerating(false);
      setGenerationProgress(0);
      setGenerationStage('');
      return;
    }

    const createVariant = (id: string, title: string, text: string, details?: VariantDetails): VariantOption => ({
      id,
      title,
      badge: details?.success ? (details.provider === 'browser' ? 'Local AI' : (aiMode === 'demo' ? 'Demo Mode Server AI' : `Cloud AI (${details.provider})`)) : 'Generating...',
      contentHtml: formatToHtml(text, id === 'v2'),
      details,
    });

    try {
      let browserSession: any | null = null;

      if (useBrowserAi) {
        const browserCheck = await checkBrowserAiAvailability();
        setBrowserAiStatus(browserCheck.status);
        setBrowserAiMessage(browserCheck.message);

        if (browserCheck.status === 'ready' || browserCheck.status === 'downloadable' || browserCheck.status === 'downloading') {
          updateGenerationProgress(10, browserCheck.status === 'ready'
            ? 'Local AI ready — generating draft...'
            : 'Preparing local AI model...');

          browserSession = await getBrowserAiSession((progress) => {
            const safeProgress = Math.round(Math.max(0, Math.min(100, progress)));
            setBrowserAiStatus('downloading');
            setBrowserAiDownloadProgress(safeProgress);
            updateGenerationProgress(
              Math.min(18, 10 + Math.floor(safeProgress * 0.08)),
              `Local AI — downloading local model (${safeProgress}%)...`
            );
          });

          if (browserSession) {
            setBrowserAiStatus('ready');
            setBrowserAiMessage('Local AI is available.');
            setBrowserAiDownloadProgress(100);
          } else {
            const failedCheck = await checkBrowserAiAvailability();
            setBrowserAiStatus(failedCheck.status);
            setBrowserAiMessage(failedCheck.message);
          }
        }
      }

      if (useBrowserAi && !browserSession && !demoAvailable) {
        setBrowserAiStatus((current) => current === 'checking' ? 'unavailable' : current);
        setBrowserAiMessage((current) => current || 'Local AI is unavailable and Demo Mode Server AI is not configured on the server.');
        setStatusMessage({ type: 'error', text: 'Local AI is unavailable and Demo Mode Server AI is not configured. Select Cloud AI and enter your API key.' });
        setIsGenerating(false);
        setGenerationProgress(0);
        setGenerationStage('');
        return;
      }

      if (useBrowserAi && !browserSession) {
        setBrowserAiStatus((current) => current === 'checking' ? 'unavailable' : current);
        setBrowserAiMessage((current) => current || 'Local AI is unavailable; Demo Mode Server AI will be used instead.');
        setStatusMessage({
          type: 'info',
          text: 'Local AI is not available on this device. Using Demo Mode Server AI instead.'
        });
      }
      let storyBrowser: BrowserAiResult | null = null;
      let storyCloud: CloudAiResult | null = null;
      let finalMode: 'browser' | 'cloud' | 'template' = 'template';

      if (useBrowserAi && browserSession) {
        updateGenerationProgress(12, 'Local AI ready — generating draft...');

        updateGenerationProgress(20, 'Local AI — streaming draft...');
        storyBrowser = await generateWithBrowserAi(
          contextText, computedGoal, computedTone, 'story',
          (partial) => {
            const progress = Math.min(45, 20 + Math.floor(partial.length / 30));
            updateGenerationProgress(progress, 'Local AI — streaming draft...');
          }
        );
        updateGenerationProgress(82, 'Local AI — draft complete...');
      }

      const streamCloudVariant = async (styleFormat: 'story' | 'list', variantId: string): Promise<CloudAiResult> => {
        const generatedPrompt = buildGenerationPrompt(contextText, computedGoal, computedTone, styleFormat, meetingContext);
        const start = performance.now();
        const details: VariantDetails = {
          provider: effectiveProvider || cloudProvider,
          model: effectiveModel || undefined,
          success: false,
          params: { temperature: 0.7, max_tokens: 1200 },
          timeMs: 0,
        };
        let accumulated = '';

        try {
          const response = await fetch(`${BACKEND_URL}/api/v1/llm/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
            body: JSON.stringify({
              provider: effectiveProvider,
              model: effectiveModel,
              prompt: generatedPrompt,
              api_key: (aiMode === 'cloud') ? (cloudApiKey || undefined) : undefined,
              demo_mode: aiMode === 'demo' || (aiMode === 'auto' && !browserSession),
              prefer_browser: false,
              prefer_cloud: true,
              params: { temperature: 0.7, max_tokens: 1200 },
            }),
          });

          if (!response.ok || !response.body) {
            const errorBody = await response.text();
            details.error = `Cloud streaming API failure (${response.status}): ${errorBody}`;
            details.timeMs = Math.round(performance.now() - start);
            return { text: '', details };
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          const applyStreamingText = () => {
            const title = styleFormat === 'story'
              ? `📖 ${computedGoal} (Narrative Hook)`
              : `📋 ${computedGoal} (Bulleted Takeaways)`;
            const streamingDetails = { ...details, success: Boolean(accumulated.trim()), timeMs: Math.round(performance.now() - start) };
            setVariants((current) => {
              const existing = current.filter((v) => v.id !== variantId);
              const next = [...existing, createVariant(variantId, title, accumulated, streamingDetails)];
              return next.sort((a, b) => a.id.localeCompare(b.id));
            });
          };

          const consumeEvent = (eventBlock: string) => {
            const dataLines = eventBlock.split(/\r?\n/).filter((line) => line.startsWith('data:'));
            if (!dataLines.length) return;
            const data = dataLines.map((line) => line.slice(5).trimStart()).join('\n');
            if (!data || data === '[DONE]') return;

            let chunk: any = data;
            try { chunk = JSON.parse(data); } catch { /* plain text SSE */ }

            const delta = typeof chunk === 'string'
              ? chunk
              : chunk?.text ?? chunk?.delta ?? chunk?.token ?? chunk?.content ?? chunk?.choices?.[0]?.delta?.content ?? chunk?.choices?.[0]?.text ?? '';
            if (delta) {
              accumulated += String(delta);
              const base = styleFormat === 'story' ? 20 : 55;
              const cap = styleFormat === 'story' ? 45 : 80;
              const progress = Math.min(cap, base + Math.floor(accumulated.length / 30));
              updateGenerationProgress(
                progress,
                `AI — streaming ${styleFormat === 'story' ? 'Narrative' : 'Takeaways'} variant...`
              );
              applyStreamingText();
            }
            if (chunk?.model) details.model = chunk.model;
            if (chunk?.provider) details.provider = chunk.provider;
            if (chunk?.usage) details.usage = chunk.usage;
            if (chunk?.rate_limit || chunk?.rateLimit) details.rateLimit = chunk.rate_limit || chunk.rateLimit;
            if (chunk?.error) details.error = String(chunk.error);
          };

          while (true) {
            const { value, done } = await reader.read();
            if (value) {
              buffer += decoder.decode(value, { stream: !done });
              const events = buffer.split(/\r?\n\r?\n/);
              buffer = events.pop() || '';
              events.forEach(consumeEvent);
            }
            if (done) break;
          }
          if (buffer.trim()) consumeEvent(buffer);

          details.timeMs = Math.round(performance.now() - start);
          details.success = Boolean(accumulated.trim()) && !details.error;
          if (!details.success && !details.error) details.error = 'Cloud streaming returned no usable text.';
          applyStreamingText();
          return { text: accumulated.trim(), details };
        } catch (error: any) {
          details.timeMs = Math.round(performance.now() - start);
          details.error = error?.message || String(error);

          // applyStreamingText is scoped to the try block, so update the
          // streaming variant directly here on error.
          const title = styleFormat === 'story'
            ? `📖 ${computedGoal} (Narrative Hook)`
            : `📋 ${computedGoal} (Bulleted Takeaways)`;
          const streamingDetails = {
            ...details,
            success: Boolean(accumulated.trim()),
            timeMs: Math.round(performance.now() - start),
          };
          setVariants((current) => {
            const existing = current.filter((v) => v.id !== variantId);
            const next = [
              ...existing,
              createVariant(variantId, title, accumulated, streamingDetails),
            ];
            return next.sort((a, b) => a.id.localeCompare(b.id));
          });

          return { text: accumulated.trim(), details };
        }
      };

      if (!storyBrowser?.details.success) {
        updateGenerationProgress(20, aiMode === 'demo' ? 'Demo Mode — streaming descriptive draft...' : 'AI — streaming descriptive draft...');
        storyCloud = await streamCloudVariant('story', 'v1');
        updateGenerationProgress(82, 'Descriptive draft complete...');
      }

      const storyFinal = storyBrowser?.details.success ? storyBrowser : storyCloud;

      if (storyFinal?.details.success) {
        finalMode = storyFinal.details.provider === 'browser' ? 'browser' : 'cloud';
      }

      const activeProviderLabel = finalMode === 'browser'
        ? 'Local AI'
        : finalMode === 'cloud'
        ? (aiMode === 'demo' ? 'Demo Mode Server AI' : `Cloud AI (${effectiveProvider || cloudProvider})`)
        : 'Template';

      updateGenerationProgress(92, 'Finalizing draft...');
      setVariants([
        createVariant('v1', '✍️ Descriptive Draft', storyFinal?.text || '', storyFinal?.details),
      ]);

      if (browserSession) {
        setBrowserAiStatus('ready');
        setBrowserAiMessage('Local AI is available.');
      }
      setGenerationMode(finalMode);
      setStatusMessage({
        type: finalMode === 'template' ? 'info' : 'success',
        text: finalMode === 'template' ? 'Generated a draft from template.' : `Generated a draft via ${activeProviderLabel}.`,
      });
      updateGenerationProgress(100, 'Generation complete');
      window.setTimeout(() => {
        setGenerationProgress(0);
        setGenerationStage('');
      }, 900);
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: `Variant generation failed: ${error?.message || String(error)}` });
      setGenerationProgress(0);
      setGenerationStage('');
    } finally {
      setIsGenerating(false);
    }
  };

  const applyVariantToEditor = (htmlContent: string) => {
    if (editor) {
      editor.commands.setContent(htmlContent);
      setEditorHtml(htmlContent);
      setPlainText(convertHtmlToLinkedInText(htmlContent));
      setStatusMessage({ type: 'success', text: 'Variant applied to canvas editor!' });
    }
  };

  const insertSymbolAtCursor = (symbol: string) => {
    if (editor) editor.chain().focus().insertContent(symbol).run();
  };

  return (
    <div className="workspace-shell" style={{ backgroundColor: '#f1f5f9', minHeight: '100vh', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#0f172a' }}>
      
      <style>{`
        .ProseMirror { outline: none; min-height: 160px; caret-color: #0066c2; }
        .workspace-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(340px, 1fr); gap: 24px; align-items: start; }
        .workspace-preview { position: sticky; top: 24px; }
        .header-actions { display: flex; align-items: center; gap: 8px; }
        @media (max-width: 900px) {
          .workspace-grid { grid-template-columns: 1fr !important; }
          .workspace-preview { position: static !important; }
        }
        @media (max-width: 640px) {
          .workspace-shell { padding: 12px !important; }
          .workspace-header { padding: 14px !important; align-items: flex-start !important; }
          .workspace-header h1 { font-size: 16px !important; }
          .workspace-header-subtitle { font-size: 11px !important; }
          .header-actions { width: 100%; }
          .header-actions button { width: 100%; justify-content: center; }
          .workspace-card { padding: 14px !important; border-radius: 12px !important; }
          .toolbar-wrap { overflow-x: auto; flex-wrap: nowrap !important; padding-bottom: 2px; }
          .emoji-strip { overflow-x: auto; flex-wrap: nowrap !important; }
          .draft-actions { flex-direction: column !important; }
          .draft-actions button { width: 100%; }
          .status-row { align-items: flex-start !important; flex-direction: column !important; }
          .status-row > div:last-child { width: 100%; }
          .status-row button { flex: 1; }
        }
        .ProseMirror-focused { border-color: #0066c2 !important; box-shadow: 0 0 0 3px rgba(0, 102, 194, 0.15); }
        .ProseMirror ::selection { background-color: #bfdbfe !important; color: #1e3a8a !important; }
      `}</style>

      <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* HEADER BAR */}
        <header className="workspace-header" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '16px 24px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div style={{ width: '42px', height: '42px', backgroundColor: '#0f172a', color: '#ffffff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={22} />
            </div>
            <div>
              <h1 className="workspace-header-title" style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>LinkedIn Posts Draft Creator</h1>
              <p className="workspace-header-subtitle" style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Voice-Driven LinkedIn Draft & Content Engine</p>
            </div>
          </div>

          <div className="header-actions">
          <button 
            onClick={() => setShowAuthConfig(!showAuthConfig)}
            style={{ backgroundColor: '#0f172a', color: '#ffffff', border: 'none', padding: '9px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Key size={14} />
            <span>API Credentials & Auth Info for Direct Publishing</span>
          </button>
          </div>
        </header>

        {showAuthConfig && (
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #3b82f6', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700' }}>API Credentials & Auth Info for Direct Publishing</h3>
              <button onClick={() => setShowAuthConfig(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            </div>
            <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: '1.5' }}>
              Direct API publishing requires an authorized OAuth URN and Client Secret. 
              <strong> Send a direct message (DM) to info@sunarctechnologies.com to enable direct background publishing.</strong>
            </p>
          </div>
        )}

        {statusMessage && (
          <div style={{ 
            padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: '500', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: statusMessage.type === 'error' ? '#fef2f2' : statusMessage.type === 'success' ? '#ecfdf5' : '#eff6ff',
            color: statusMessage.type === 'error' ? '#991b1b' : statusMessage.type === 'success' ? '#065f46' : '#1e40af',
            border: `1px solid ${statusMessage.type === 'error' ? '#fecaca' : statusMessage.type === 'success' ? '#a7f3d0' : '#bfdbfe'}`
          }}>
            <span>{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
          </div>
        )}

        <div className="workspace-grid">
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div className="workspace-card" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                <span style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>1. Fast Draft Generator for LinkedIn Post</span>

              </div>

              <div className="context-selector">
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                  What are you posting about?
                </label>
                <select
                  value={meetingContext}
                  onChange={(e) => setMeetingContext(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                  aria-label="Post situation"
                >
                  {MEETING_CONTEXTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <div style={{ marginTop: '5px', fontSize: '10px', color: '#64748b' }}>
                  {MEETING_CONTEXTS.find((item) => item.id === meetingContext)?.hint}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Speak or type your context
                </label>
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  style={{
                    width: '100%', padding: '14px', borderRadius: '12px',
                    border: isListening ? '2px solid #ef4444' : '1px solid #cbd5e1',
                    backgroundColor: isListening ? '#fef2f2' : '#f8fafc',
                    color: isListening ? '#dc2626' : '#0f172a',
                    fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                  }}
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} style={{ color: '#0066c2' }} />}
                  <span>{isListening ? 'Listening... Click to Stop Dictation' : '🎙️ Tap to Dictate Notes / Context'}</span>
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Add more details if useful
                </label>
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="What happened, what did you learn, who is it for, and what should people take away?"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', lineHeight: '1.5' }}
                  rows={3}
                />
              </div>

              <div className="options-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Tone
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {tonesList.map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => setSelectedTone(tone)}
                        style={{
                          padding: '5px 12px', borderRadius: '16px', fontSize: '11px', fontWeight: '600', border: 'none', cursor: 'pointer',
                          backgroundColor: selectedTone === tone ? '#0f172a' : '#ffffff',
                          color: selectedTone === tone ? '#ffffff' : '#475569'
                        }}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SIMPLE AI CONTROL */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '14px', borderRadius: '12px' }}>
                {/* Row 1: AI mode */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap'
                }}>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: '#1e3a8a' }}>
                    How should AI help?
                  </span>
                  <select
                    value={aiMode}
                    onChange={(e) => setAiMode(e.target.value as 'auto' | 'cloud' | 'demo')}
                    style={{
                      flex: '1 1 260px',
                      minWidth: 0,
                      padding: '7px 9px',
                      borderRadius: '6px',
                      border: '1px solid #93c5fd',
                      backgroundColor: '#ffffff',
                      color: '#1e3a8a',
                      fontSize: '11px',
                      fontWeight: '700'
                    }}
                    aria-label="AI generation mode"
                  >
                    <option value="auto">Automatic — use the best available AI</option>
                    <option value="demo" disabled={!demoAvailable}>Demo Mode — Server AI{demoAvailable ? "" : " (not configured)"}</option>
                    <option value="cloud">Cloud AI — My API Key</option>
                  </select>
                </div>

                {aiMode === 'cloud' && (<div>
                {/* Cloud provider + model */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: '10px',
                  width: '100%'
                }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#1e3a8a', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Cloud Provider
                    </label>
                    <select
                      value={cloudProvider}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      style={{
                        width: '100%',
                        minWidth: 0,
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #93c5fd',
                        fontSize: '12px',
                        backgroundColor: '#ffffff',
                        boxSizing: 'border-box'
                      }}
                    >
                      {CLOUD_PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                      <option value="custom">Custom Provider</option>
                    </select>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#1e3a8a', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Target Model
                    </label>
                    <select
                      value={cloudModel}
                      onChange={(e) => setCloudModel(e.target.value)}
                      style={{
                        width: '100%',
                        minWidth: 0,
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #93c5fd',
                        fontSize: '12px',
                        backgroundColor: '#ffffff',
                        boxSizing: 'border-box'
                      }}
                    >
                      {CLOUD_PROVIDERS.find((p) => p.id === cloudProvider)?.models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      {cloudProvider === 'custom' && <option value={customModel}>{customModel || 'Enter custom model below'}</option>}
                    </select>
                  </div>
                </div>

                {cloudProvider === 'custom' && (
                  <div className="cloud-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#1e3a8a', textTransform: 'uppercase', marginBottom: '4px' }}>Provider ID / Name</label>
                      <input value={customProvider} onChange={(e) => setCustomProvider(e.target.value)} placeholder="e.g. groq, mistral, deepseek" style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#1e3a8a', textTransform: 'uppercase', marginBottom: '4px' }}>Model ID</label>
                      <input value={customModel} onChange={(e) => { setCustomModel(e.target.value); setCloudModel(e.target.value); }} placeholder="e.g. llama-3.3-70b-versatile" style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px' }} />
                    </div>
                  </div>
                )}

                {/* USER API KEY */}
                
                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#1e3a8a', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Optional Custom API Key (In-Memory Only)
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={cloudApiKey}
                      onChange={(e) => setCloudApiKey(e.target.value)}
                      placeholder={`Enter ${CLOUD_PROVIDERS.find(p=>p.id===cloudProvider)?.name} API Key (e.g. sk-...)`}
                      style={{ width: '100%', padding: '8px 36px 8px 10px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px', backgroundColor: '#ffffff' }}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{ position: 'absolute', right: '8px', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
                      title={showApiKey ? "Hide Key" : "Show Key"}
                    >
                      {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <span style={{ fontSize: '10px', color: '#60a5fa', marginTop: '2px', display: 'block' }}>
                    Your key is sent only for this generation and is not stored by the UI.
                  </span>
                </div>
                </div>
                )}

                {aiMode === 'demo' && (
                  <div style={{ padding: '9px 10px', borderRadius: '8px', background: '#dbeafe', color: '#1e3a8a', fontSize: '11px', lineHeight: 1.45 }}>
                    <strong>Demo Mode:</strong> uses the application's server-side AI key. Availability depends on the configured provider quota. Your API key is not required.
                    {demoProviders.length > 0 && <span> Server providers: {demoProviders.join(', ')}.</span>}
                  </div>
                )}
              </div>

              {/* BROWSER AI STATUS / SETUP */}
              {aiMode === 'auto' && (
                <div style={{
                  backgroundColor: browserAiStatus === 'ready' ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${browserAiStatus === 'ready' ? '#bbf7d0' : '#fde68a'}`,
                  borderRadius: '10px',
                  padding: '10px 12px',
                  marginTop: '2px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                      {browserAiStatus === 'ready'
                        ? <CheckCircle2 size={15} color="#15803d" />
                        : <Sparkles size={15} color="#b45309" />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '11px', fontWeight: '800', color: '#334155' }}>
                          Local AI: {browserAiStatus === 'ready' ? 'Available' : 'Unavailable'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                          {browserAiMessage}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                      {browserAiStatus !== 'ready' && (
                        <button
                          type="button"
                          onClick={() => void checkBrowserAi(true)}
                          disabled={browserAiStatus === 'checking' || browserAiStatus === 'downloading'}
                          style={{
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#334155',
                            borderRadius: '6px',
                            padding: '5px 8px',
                            fontSize: '10px',
                            fontWeight: '700',
                            cursor: browserAiStatus === 'checking' || browserAiStatus === 'downloading' ? 'default' : 'pointer'
                          }}
                        >
                          {browserAiStatus === 'downloading'
                            ? 'Downloading...'
                            : browserAiStatus === 'unsupported'
                            ? 'Check Browser AI'
                            : 'Check / Set Up'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowBrowserAiHelp((value) => !value)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#2563eb',
                          fontSize: '10px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          padding: '5px'
                        }}
                      >
                        {showBrowserAiHelp ? 'Hide help' : 'How does this work?'}
                      </button>
                    </div>
                  </div>

                  {browserAiStatus === 'downloading' && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', marginBottom: '4px' }}>
                        <span>Local AI model download</span>
                        <span>{browserAiDownloadProgress}%</span>
                      </div>
                      <div style={{ height: '6px', width: '100%', backgroundColor: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${browserAiDownloadProgress}%`,
                          backgroundColor: '#f59e0b',
                          borderRadius: '999px',
                          transition: 'width 300ms ease-out'
                        }} />
                      </div>
                    </div>
                  )}

                  {showBrowserAiHelp && (
                    <div style={{
                      marginTop: '9px',
                      paddingTop: '9px',
                      borderTop: '1px solid #fde68a',
                      fontSize: '10px',
                      lineHeight: '1.5',
                      color: '#475569'
                    }}>
                      <strong style={{ color: '#334155' }}>Local AI is used when the device supports it.</strong>
                      <div style={{ marginTop: '4px' }}>
                        The app can use a browser/device-provided local AI capability when available. No separate AI extension is required by this app.
                      </div>
                      <div style={{ marginTop: '4px' }}>
                        For the Prompt API, support depends on the browser version, operating system,
                        device hardware, available storage, and the current local-AI rollout.
                      </div>
                      <div style={{ marginTop: '5px', fontWeight: '700', color: '#334155' }}>
                        In Automatic mode, the app uses local AI when available and automatically falls back to Demo Mode Server AI when it is not.
                      </div>
                      <div style={{ marginTop: '5px' }}>
                        For supported browsers, use their built-in AI diagnostics if available. This is optional and not required to use the app.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {aiMode === 'cloud' && (
                <div style={{
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  marginTop: '2px',
                  fontSize: '10px',
                  color: '#475569'
                }}>
                  <strong style={{ color: '#1e3a8a' }}>Cloud AI only</strong>
                  <span style={{ marginLeft: '6px' }}>
                    Local AI will not be used for this generation.
                  </span>
                </div>
              )}

              <button 
                onClick={generateMultiVariants} 
                disabled={isGenerating}
                style={{ backgroundColor: '#0066c2', color: '#ffffff', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Sparkles size={16} />
                <span>{isGenerating ? 'Generating Draft...' : 'Generate Draft'}</span>
              </button>

              {/* AI GENERATION PROGRESS */}
              {generationProgress > 0 && (
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #dbeafe', borderRadius: '10px', padding: '12px', marginTop: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '7px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#334155' }}>
                      {generationStage || 'Generating draft...'}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#1d4ed8' }}>
                      {generationProgress}%
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={generationProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={generationStage || 'AI generation progress'}
                    style={{ height: '8px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}
                  >
                    <div style={{ height: '100%', width: `${generationProgress}%`, backgroundColor: '#2563eb', borderRadius: '999px', transition: 'width 500ms ease-out' }} />
                  </div>
                </div>
              )}

              {/* VARIANTS DISPLAY */}
              {variants.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b' }}>GENERATED DRAFT:</span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{
                        backgroundColor: browserAiStatus === 'ready' ? '#dcfce7' : browserAiStatus === 'unavailable' ? '#f1f5f9' : '#eff6ff',
                        color: browserAiStatus === 'ready' ? '#166534' : '#475569',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: '700'
                      }}>
                        {aiMode === 'cloud'
                          ? 'Local AI not used'
                          : browserAiStatus === 'ready'
                          ? `${getBrowserAiModelName()} Ready`
                          : browserAiStatus === 'downloading'
                          ? `Local AI Downloading ${browserAiDownloadProgress}%`
                          : browserAiStatus === 'downloadable'
                          ? 'Local AI Model Ready to Prepare'
                          : browserAiStatus === 'checking'
                          ? 'Checking Local AI'
                          : 'Local AI Unavailable — Demo fallback'}
                      </span>
                      <span style={{ backgroundColor: generationMode === 'browser' ? '#fef3c7' : generationMode === 'cloud' ? '#e0f2fe' : '#f3f4f6', color: generationMode === 'browser' ? '#92400e' : generationMode === 'cloud' ? '#075985' : '#374151', padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '700' }}>
                        {generationMode === 'browser' ? 'Final: Local AI' : generationMode === 'cloud' ? (aiMode === 'demo' ? 'Final: Demo Mode Server AI' : 'Final: Cloud AI') : generationMode === 'template' ? 'Final: Template' : 'Final: Pending'}
                      </span>
                    </div>
                  </div>
                  {variants.map((v) => (
                    <div key={v.id} style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '12px' }}>
                        <span>{v.title}</span>
                        <span style={{ backgroundColor: v.details?.success ? '#dbeafe' : '#fee2e2', color: v.details?.success ? '#1e40af' : '#991b1b', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>{v.badge}</span>
                      </div>
                      {v.details && (
                        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', fontSize: '11px', color: '#334155', lineHeight: '1.4' }}>
                          <div style={{ marginBottom: '4px' }}><strong>AI:</strong> {v.details.provider} / {v.details.model || 'default'}</div>
                          {v.details.usage && (
                            <div style={{ marginBottom: '4px' }}><strong>Tokens:</strong> {v.details.usage.prompt_tokens ?? '-'} prompt / {v.details.usage.completion_tokens ?? '-'} completion / {v.details.usage.total_tokens ?? '-'} total</div>
                          )}
                          {v.details.rateLimit && (
                            <div style={{ marginBottom: '4px' }}><strong>Rate Limit:</strong> {Object.entries(v.details.rateLimit).map(([key, value]) => `${key}: ${value}`).join(' • ')}</div>
                          )}
                          {v.details.params && (
                            <div style={{ marginBottom: '4px' }}><strong>Params:</strong> T={v.details.params.temperature ?? '-'} / max={v.details.params.max_tokens ?? '-'}</div>
                          )}
                          <div><strong>Time:</strong> {v.details.timeMs ?? '-'} ms</div>
                          {v.details.error && (
                            <div style={{ marginTop: '6px', color: '#b91c1c' }}><strong>Error:</strong> {v.details.error}</div>
                          )}
                        </div>
                      )}
                      
                      <button 
                        onClick={() => applyVariantToEditor(v.contentHtml)}
                        style={{ border: 'none', background: 'none', color: '#0066c2', fontWeight: '700', fontSize: '12px', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                      >
                        ✓ Load into Post Canvas
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CANVAS EDITOR */}
            <div className="workspace-card" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                <span style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>2. Post Canvas Editor</span>
                <span style={{ fontSize: '11px', color: plainText.length > LINKEDIN_MAX_CHARS ? '#dc2626' : '#64748b', fontWeight: plainText.length > LINKEDIN_MAX_CHARS ? '700' : 'normal' }}>
                  Characters: <strong>{plainText.length}</strong> / {LINKEDIN_MAX_CHARS} max
                </span>
              </div>

              {editor && (
                <div className="toolbar-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', backgroundColor: '#f8fafc', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => editor.chain().focus().toggleBold().run()}
                      style={{ width: '32px', height: '32px', borderRadius: '6px', border: editor.isActive('bold') ? '1px solid #0066c2' : '1px solid transparent', backgroundColor: editor.isActive('bold') ? '#eff6ff' : 'transparent', color: editor.isActive('bold') ? '#0066c2' : '#475569', cursor: 'pointer' }}
                    >
                      <Bold size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                      style={{ width: '32px', height: '32px', borderRadius: '6px', border: editor.isActive('italic') ? '1px solid #0066c2' : '1px solid transparent', backgroundColor: editor.isActive('italic') ? '#eff6ff' : 'transparent', color: editor.isActive('italic') ? '#0066c2' : '#475569', cursor: 'pointer' }}
                    >
                      <Italic size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={handleAddLink}
                      style={{ width: '32px', height: '32px', borderRadius: '6px', border: editor.isActive('link') ? '1px solid #0066c2' : '1px solid transparent', backgroundColor: editor.isActive('link') ? '#eff6ff' : 'transparent', color: editor.isActive('link') ? '#0066c2' : '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <LinkIcon size={15} />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0 8px', height: '32px', borderRadius: '6px', border: '1px solid transparent', backgroundColor: '#eff6ff', color: '#0066c2', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      <ImageIcon size={15} />
                      <span>Add Image</span>
                    </button>

                    <div style={{ width: '1px', height: '18px', backgroundColor: '#cbd5e1', margin: '0 4px' }} />

                    <button
                      type="button"
                      onClick={() => editor.chain().focus().toggleBulletList().run()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0 8px', height: '32px', borderRadius: '6px', border: editor.isActive('bulletList') ? '1px solid #0066c2' : '1px solid transparent', backgroundColor: editor.isActive('bulletList') ? '#eff6ff' : 'transparent', color: editor.isActive('bulletList') ? '#0066c2' : '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      <List size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => editor.chain().focus().toggleOrderedList().run()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0 8px', height: '32px', borderRadius: '6px', border: editor.isActive('orderedList') ? '1px solid #0066c2' : '1px solid transparent', backgroundColor: editor.isActive('orderedList') ? '#eff6ff' : 'transparent', color: editor.isActive('orderedList') ? '#0066c2' : '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      <ListOrdered size={15} />
                    </button>
                  </div>

                  <div className="emoji-strip" style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#ffffff', padding: '3px 8px', borderRadius: '20px', border: '1px solid #cbd5e1', flexWrap: 'wrap' }}>
                    <Smile size={14} style={{ color: '#0066c2', marginRight: '2px' }} />
                    {emojiAndSymbolsList.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => insertSymbolAtCursor(item)}
                        style={{ border: 'none', background: 'none', fontSize: '14px', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ minHeight: '160px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', fontSize: '13px', lineHeight: '1.6', position: 'relative' }}>
                <EditorContent editor={editor} />
              </div>

              {attachedImageUrl && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>🖼️ Attached Canvas Image:</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={copyImageToClipboard}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '11px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Copy size={13} /> Copy Image
                    </button>
                    <a
                      href={attachedImageUrl}
                      download="linkedin-post-image.png"
                      style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '11px', fontWeight: '600', cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Download size={13} /> Download
                    </a>
                  </div>
                </div>
              )}

              <div className="draft-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleManualPost}
                  style={{ flex: 1, backgroundColor: '#0066c2', color: '#ffffff', border: 'none', padding: '14px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <ExternalLink size={16} />
                  <span>Copy Draft & Open LinkedIn</span>
                </button>

                <button 
                  disabled={true}
                  style={{ flex: 1, backgroundColor: '#94a3b8', color: '#ffffff', border: 'none', padding: '14px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'not-allowed', opacity: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <Lock size={15} />
                  <span>Publish Direct API (DM to Unlock)</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: PREVIEW */}
          <div className="workspace-preview" style={{ position: 'sticky', top: '24px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#0f172a', color: '#ffffff', padding: '10px 16px', fontSize: '12px', fontWeight: '700', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Eye size={14} style={{ color: '#38bdf8' }} /> Live Post Canvas
                </span>
                <span style={{ backgroundColor: '#059669', color: '#ffffff', padding: '2px 8px', borderRadius: '10px', fontSize: '10px' }}>Real-time Preview</span>
              </div>

              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '42px', height: '42px', backgroundColor: '#0066c2', borderRadius: '50%', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                    <Building2 size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Enterprise Cloud Solutions <CheckCircle2 size={13} style={{ color: '#0066c2' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>14,200 followers • Promoted</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Just now • <Globe size={10} />
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '13px', color: '#1e293b', lineHeight: '1.6', minHeight: '120px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                  {editorHtml && editorHtml !== '<p></p>' ? (
                    <div dangerouslySetInnerHTML={{ __html: editorHtml }} />
                  ) : (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Your generated content will dynamically render here...</span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ backgroundColor: '#0066c2', color: '#ffffff', borderRadius: '50%', padding: '2px', fontSize: '8px' }}>👍</span>
                    <span style={{ fontWeight: '600' }}>1,420</span>
                  </div>
                  <div>48 comments • 12 reposts</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}