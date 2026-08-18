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
      const listHtml = `<ul class="linkedin-list">` +
        currentListItems.map((item) => `<li class="linkedin-list-item">${item}</li>`).join('') +
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
      htmlBlocks.push(`<p class="linkedin-paragraph">${line}</p>`);
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
          return { status: 'ready', message: 'Browser AI is ready.', availability };
        }

        if (availability === 'downloadable') {
          return {
            status: 'downloadable',
            message: 'Browser AI is supported, but the local AI model needs to be downloaded.',
            availability,
          };
        }

        if (availability === 'downloading') {
          return {
            status: 'downloading',
            message: 'Browser AI is downloading the local AI model.',
            availability,
          };
        }

        return {
          status: 'unavailable',
          message: 'Browser AI is not available on this browser or device.',
          availability,
        };
      }

      return {
        status: 'ready',
        message: 'Browser AI API is available.',
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
          return { status: 'ready', message: 'Browser AI is ready.', availability: available };
        }

        if (available === 'after-download' || available === 'downloadable') {
          return {
            status: 'downloadable',
            message: 'Browser AI is supported, but the local AI model needs to be downloaded.',
            availability: available,
          };
        }

        return {
          status: 'unavailable',
          message: 'Browser AI is not available on this browser or device.',
          availability: available,
        };
      }

      return {
        status: 'ready',
        message: 'Browser AI API is available.',
        availability: 'readily',
      };
    }

    return {
      status: 'unsupported',
      message: 'This browser does not expose the required Browser AI API.',
    };
  } catch (err: any) {
    console.warn('Browser AI availability check failed:', err);
    return {
      status: 'error',
      message: err?.message || 'Browser AI could not be checked.',
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
            console.warn('Browser AI download monitor unavailable:', monitorError);
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
    console.warn('Failed to initialize Browser AI:', err);
  }

  return null;
}

export function getBrowserAiModelName(): string {
  if (typeof window === 'undefined') return 'Browser AI';

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

  return 'Browser AI';
}

const isGeneralGoal = (goal: string) => goal === 'General / Custom' || goal === 'General / Context';

const buildGenerationPrompt = (
  topicText: string,
  goal: string,
  tone: string,
  styleFormat: 'story' | 'list'
): string => {
  const goalPrompt = isGeneralGoal(goal) ? 'update' : `${goal} post`;
  const tonePrompt = tone === 'General / Custom' ? 'authentic' : tone;

  const formatInstructions = styleFormat === 'story'
    ? 'Write in clear narrative paragraph form with strong hook sentences. Do not use bullet points. Make it polished, complete, and easy to read. Include a strong opening, meaningful middle, and natural conclusion.'
    : 'Format the post as a polished list-driven LinkedIn update with one opening paragraph, then 3 short takeaway bullets starting with "🔹 ", and a concise closing line. Make it feel complete and professional.';

  return `Write one high-converting LinkedIn ${goalPrompt}.
Tone: ${tonePrompt}.
Context / Key Points: ${topicText || 'General industry insight'}.
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
      details.error = 'Browser AI session is unavailable.';
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
      details.error = result?.error || result?.message || 'Browser AI returned no text.';
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
  const [browserAiMessage, setBrowserAiMessage] = useState<string>('Checking Browser AI...');
  const [browserAiDownloadProgress, setBrowserAiDownloadProgress] = useState<number>(0);
  const [showBrowserAiHelp, setShowBrowserAiHelp] = useState<boolean>(false);
  // Auto = use local Browser AI when available, otherwise Cloud AI.
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
    setBrowserAiMessage('Checking Browser AI...');
    setBrowserAiDownloadProgress(0);

    const result = await checkBrowserAiAvailability();

    // Give users a useful explanation on browsers that do not expose
    // the Browser AI API (for example Safari and Firefox).
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
        `Browser AI is not available in ${browserName}. ` +
        `Auto mode will use Cloud AI instead. ` +
        `For local Browser AI, use a supported desktop Chrome or Edge version.`;

      setBrowserAiStatus('unsupported');
      setBrowserAiMessage(unsupportedMessage);
      setShowBrowserAiHelp(true);
      setStatusMessage({
        type: 'info',
        text: `${browserName} does not currently support Browser AI. Cloud AI fallback is available.`
      });
      return;
    }

    setBrowserAiStatus(result.status);
    setBrowserAiMessage(result.message);

    if (startModelDownload && (result.status === 'downloadable' || result.status === 'downloading')) {
      setBrowserAiStatus('downloading');
      setBrowserAiMessage('Browser AI is downloading the local AI model...');
      try {
        await getBrowserAiSession((progress) => {
          setBrowserAiDownloadProgress(Math.round(Math.max(0, Math.min(100, progress))));
        });
        const ready = await checkBrowserAiAvailability();
        setBrowserAiStatus(ready.status === 'ready' ? 'ready' : ready.status);
        setBrowserAiMessage(
          ready.status === 'ready'
            ? 'Browser AI is ready.'
            : ready.message
        );
      } catch (err: any) {
        setBrowserAiStatus('error');
        setBrowserAiMessage(err?.message || 'Browser AI model setup failed.');
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
      badge: details?.success ? (details.provider === 'browser' ? getBrowserAiModelName() : `Cloud AI (${details.provider})`) : 'Generating...',
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
            ? 'Browser AI ready — generating variants...'
            : 'Preparing Browser AI local model...');

          browserSession = await getBrowserAiSession((progress) => {
            const safeProgress = Math.round(Math.max(0, Math.min(100, progress)));
            setBrowserAiStatus('downloading');
            setBrowserAiDownloadProgress(safeProgress);
            updateGenerationProgress(
              Math.min(18, 10 + Math.floor(safeProgress * 0.08)),
              `Browser AI — downloading local model (${safeProgress}%)...`
            );
          });

          if (browserSession) {
            setBrowserAiStatus('ready');
            setBrowserAiMessage('Browser AI is ready.');
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
        setBrowserAiMessage((current) => current || 'Browser AI is unavailable and Demo Mode is not configured on the server.');
        setStatusMessage({ type: 'error', text: 'Browser AI is unavailable and server Demo Mode is not configured. Select Cloud AI and enter your API key.' });
        setIsGenerating(false);
        setGenerationProgress(0);
        setGenerationStage('');
        return;
      }

      if (useBrowserAi && !browserSession) {
        setBrowserAiStatus((current) => current === 'checking' ? 'unavailable' : current);
        setBrowserAiMessage((current) => current || 'Browser AI is unavailable; Cloud AI will be used instead.');
        setStatusMessage({
          type: 'info',
          text: 'Browser AI is not ready on this browser/device. Using Cloud AI instead.'
        });
      }
      let storyBrowser: BrowserAiResult | null = null;
      let storyCloud: CloudAiResult | null = null;
      let finalMode: 'browser' | 'cloud' | 'template' = 'template';

      if (useBrowserAi && browserSession) {
        updateGenerationProgress(12, 'Browser AI ready — generating variants...');

        updateGenerationProgress(20, 'Browser AI — streaming Narrative variant...');
        storyBrowser = await generateWithBrowserAi(
          contextText, computedGoal, computedTone, 'story',
          (partial) => {
            const progress = Math.min(45, 20 + Math.floor(partial.length / 30));
            updateGenerationProgress(progress, 'Browser AI — streaming Narrative variant...');
          }
        );
        updateGenerationProgress(82, 'Browser AI — descriptive draft complete...');
      }

      const streamCloudVariant = async (styleFormat: 'story' | 'list', variantId: string): Promise<CloudAiResult> => {
        const generatedPrompt = buildGenerationPrompt(contextText, computedGoal, computedTone, styleFormat);
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
                `Cloud AI — streaming ${styleFormat === 'story' ? 'Narrative' : 'Takeaways'} variant...`
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
        updateGenerationProgress(20, aiMode === 'demo' ? 'Demo Mode — streaming descriptive draft...' : 'Cloud AI — streaming descriptive draft...');
        storyCloud = await streamCloudVariant('story', 'v1');
        updateGenerationProgress(82, 'Descriptive draft complete...');
      }

      const storyFinal = storyBrowser?.details.success ? storyBrowser : storyCloud;

      if (storyFinal?.details.success) {
        finalMode = storyFinal.details.provider === 'browser' ? 'browser' : 'cloud';
      }

      const activeProviderLabel = finalMode === 'browser'
        ? getBrowserAiModelName()
        : finalMode === 'cloud'
        ? `Cloud AI (${effectiveProvider || cloudProvider})`
        : 'Template';

      updateGenerationProgress(92, 'Finalizing AI variants...');
      setVariants([
        createVariant('v1', '✍️ Descriptive Draft', storyFinal?.text || '', storyFinal?.details),
      ]);

      if (browserSession) {
        setBrowserAiStatus('ready');
        setBrowserAiMessage('Browser AI is ready.');
      }
      setGenerationMode(finalMode);
      setStatusMessage({
        type: finalMode === 'template' ? 'info' : 'success',
        text: finalMode === 'template' ? 'Generated a draft from template.' : `Generated a descriptive draft via ${activeProviderLabel}.`,
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
    <div className="linkedin-workspace">
      <style>{`
        .linkedin-workspace {
          --li-blue: #0066c2;
          --li-blue-dark: #004182;
          --li-navy: #0f172a;
          --li-text: #1e293b;
          --li-muted: #64748b;
          --li-border: #e2e8f0;
          --li-border-strong: #cbd5e1;
          --li-surface: #ffffff;
          --li-surface-soft: #f8fafc;
          --li-blue-soft: #eff6ff;
          min-height: 100vh;
          padding: 24px;
          box-sizing: border-box;
          background: #f1f5f9;
          color: var(--li-navy);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .linkedin-workspace *,
        .linkedin-workspace *::before,
        .linkedin-workspace *::after {
          box-sizing: border-box;
        }

        .linkedin-shell {
          width: min(100%, 1280px);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .linkedin-header,
        .linkedin-card,
        .linkedin-preview-card,
        .linkedin-auth-card,
        .linkedin-status {
          background: var(--li-surface);
          border: 1px solid var(--li-border);
          border-radius: 16px;
        }

        .linkedin-header {
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .linkedin-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .linkedin-brand-mark {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: var(--li-navy);
          color: #fff;
        }

        .linkedin-brand-copy {
          min-width: 0;
        }

        .linkedin-title {
          margin: 0;
          font-size: 18px;
          line-height: 1.25;
          font-weight: 700;
          color: var(--li-navy);
        }

        .linkedin-subtitle {
          margin: 3px 0 0;
          font-size: 12px;
          line-height: 1.4;
          color: var(--li-muted);
        }

        .linkedin-btn {
          min-height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 9px 14px;
          border-radius: 8px;
          border: 1px solid transparent;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: background .18s ease, border-color .18s ease, transform .18s ease;
        }

        .linkedin-btn:focus-visible,
        .linkedin-icon-btn:focus-visible,
        .linkedin-select:focus-visible,
        .linkedin-input:focus-visible,
        .linkedin-textarea:focus-visible {
          outline: 3px solid rgba(0, 102, 194, .16);
          outline-offset: 1px;
        }

        .linkedin-btn:active:not(:disabled) {
          transform: translateY(1px);
        }

        .linkedin-btn-dark {
          background: var(--li-navy);
          color: #fff;
        }

        .linkedin-btn-dark:hover {
          background: #1e293b;
        }

        .linkedin-btn-primary {
          width: 100%;
          background: var(--li-blue);
          color: #fff;
          border: 0;
          min-height: 44px;
          font-size: 13px;
        }

        .linkedin-btn-primary:hover {
          background: var(--li-blue-dark);
        }

        .linkedin-btn-secondary {
          background: #fff;
          color: var(--li-text);
          border-color: var(--li-border-strong);
        }

        .linkedin-btn-secondary:hover {
          background: var(--li-surface-soft);
        }

        .linkedin-btn-disabled {
          background: #94a3b8;
          color: #fff;
          border: 0;
          cursor: not-allowed;
          opacity: .75;
        }

        .linkedin-auth-card {
          padding: 20px;
          border-color: #3b82f6;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .linkedin-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid #f1f5f9;
        }

        .linkedin-card-title {
          margin: 0;
          font-size: 14px;
          line-height: 1.35;
          font-weight: 700;
          color: var(--li-navy);
        }

        .linkedin-auth-title {
          font-size: 15px;
        }

        .linkedin-body-copy {
          margin: 0;
          font-size: 12px;
          line-height: 1.5;
          color: #475569;
        }

        .linkedin-icon-btn {
          width: 34px;
          height: 34px;
          display: inline-grid;
          place-items: center;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--li-muted);
          border-radius: 7px;
          cursor: pointer;
        }

        .linkedin-icon-btn:hover {
          background: var(--li-surface-soft);
          color: var(--li-navy);
        }

        .linkedin-status {
          min-width: 0;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 13px;
          line-height: 1.45;
          font-weight: 500;
        }

        .linkedin-status-success {
          background: #ecfdf5;
          color: #065f46;
          border-color: #a7f3d0;
        }

        .linkedin-status-error {
          background: #fef2f2;
          color: #991b1b;
          border-color: #fecaca;
        }

        .linkedin-status-info {
          background: #eff6ff;
          color: #1e40af;
          border-color: #bfdbfe;
        }

        .linkedin-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.3fr) minmax(320px, 1fr);
          gap: 24px;
          align-items: start;
        }

        .linkedin-main-column {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .linkedin-card {
          min-width: 0;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .linkedin-field {
          min-width: 0;
        }

        .linkedin-label {
          display: block;
          margin-bottom: 7px;
          font-size: 11px;
          line-height: 1.3;
          font-weight: 700;
          color: var(--li-muted);
          text-transform: uppercase;
          letter-spacing: .02em;
        }

        .linkedin-label-small {
          margin-bottom: 4px;
          font-size: 10px;
          color: #1e3a8a;
        }

        .linkedin-voice-btn {
          width: 100%;
          min-height: 48px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border-radius: 12px;
          border: 1px solid var(--li-border-strong);
          background: var(--li-surface-soft);
          color: var(--li-navy);
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          text-align: center;
        }

        .linkedin-voice-btn.is-listening {
          border: 2px solid #ef4444;
          background: #fef2f2;
          color: #dc2626;
        }

        .linkedin-textarea,
        .linkedin-input,
        .linkedin-select {
          width: 100%;
          min-width: 0;
          border: 1px solid var(--li-border-strong);
          border-radius: 8px;
          background: #fff;
          color: var(--li-text);
          font: inherit;
        }

        .linkedin-textarea {
          min-height: 92px;
          padding: 12px;
          resize: vertical;
          font-size: 13px;
          line-height: 1.5;
        }

        .linkedin-input,
        .linkedin-select {
          min-height: 38px;
          padding: 8px 10px;
          font-size: 12px;
        }

        .linkedin-select {
          border-color: #93c5fd;
        }

        .linkedin-options-panel {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 14px;
          border: 1px solid var(--li-border);
          border-radius: 12px;
          background: var(--li-surface-soft);
        }

        .linkedin-chip-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .linkedin-chip {
          min-height: 30px;
          padding: 5px 12px;
          border: 0;
          border-radius: 16px;
          background: #fff;
          color: #475569;
          font: inherit;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }

        .linkedin-chip.is-selected {
          background: var(--li-navy);
          color: #fff;
        }

        .linkedin-ai-config {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 14px;
          border: 1px solid #bfdbfe;
          border-radius: 12px;
          background: #eff6ff;
        }

        .linkedin-ai-mode-row {
          display: grid;
          grid-template-columns: minmax(150px, auto) minmax(0, 1fr);
          align-items: center;
          gap: 10px;
        }

        .linkedin-ai-mode-label {
          font-size: 12px;
          font-weight: 800;
          color: #1e3a8a;
        }

        .linkedin-ai-grid,
        .linkedin-custom-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          width: 100%;
        }

        .linkedin-custom-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .linkedin-key-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .linkedin-key-input {
          padding-right: 40px;
        }

        .linkedin-key-toggle {
          position: absolute;
          right: 6px;
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border: 0;
          background: transparent;
          color: var(--li-muted);
          cursor: pointer;
          border-radius: 6px;
        }

        .linkedin-help-text {
          display: block;
          margin-top: 3px;
          font-size: 10px;
          line-height: 1.4;
          color: #60a5fa;
        }

        .linkedin-info-box {
          padding: 9px 10px;
          border-radius: 8px;
          background: #dbeafe;
          color: #1e3a8a;
          font-size: 11px;
          line-height: 1.45;
        }

        .linkedin-browser-status {
          padding: 10px 12px;
          border-radius: 10px;
          margin-top: 2px;
        }

        .linkedin-browser-status.is-ready {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
        }

        .linkedin-browser-status.is-pending {
          background: #fffbeb;
          border: 1px solid #fde68a;
        }

        .linkedin-browser-status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .linkedin-browser-status-copy {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .linkedin-browser-status-text {
          min-width: 0;
        }

        .linkedin-browser-status-title {
          font-size: 11px;
          line-height: 1.3;
          font-weight: 800;
          color: #334155;
        }

        .linkedin-browser-status-message {
          margin-top: 2px;
          font-size: 10px;
          line-height: 1.4;
          color: var(--li-muted);
          overflow-wrap: anywhere;
        }

        .linkedin-browser-actions {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }

        .linkedin-mini-btn {
          min-height: 30px;
          padding: 5px 8px;
          border: 1px solid var(--li-border-strong);
          border-radius: 6px;
          background: #fff;
          color: #334155;
          font: inherit;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .linkedin-mini-link {
          min-height: 30px;
          padding: 5px;
          border: 0;
          background: transparent;
          color: #2563eb;
          font: inherit;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .linkedin-download-progress {
          margin-top: 8px;
        }

        .linkedin-progress-meta {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 4px;
          font-size: 9px;
          color: var(--li-muted);
        }

        .linkedin-progress-track {
          width: 100%;
          height: 7px;
          overflow: hidden;
          border-radius: 999px;
          background: #e2e8f0;
        }

        .linkedin-progress-fill {
          height: 100%;
          border-radius: inherit;
          background: #2563eb;
          transition: width 500ms ease-out;
        }

        .linkedin-download-fill {
          background: #f59e0b;
          transition: width 300ms ease-out;
        }

        .linkedin-browser-help {
          margin-top: 9px;
          padding-top: 9px;
          border-top: 1px solid #fde68a;
          font-size: 10px;
          line-height: 1.5;
          color: #475569;
        }

        .linkedin-browser-help > div {
          margin-top: 4px;
        }

        .linkedin-browser-help .strong {
          font-weight: 700;
          color: #334155;
        }

        .linkedin-cloud-note {
          margin-top: 2px;
          padding: 9px 12px;
          border: 1px solid #bfdbfe;
          border-radius: 10px;
          background: #eff6ff;
          color: #475569;
          font-size: 10px;
          line-height: 1.4;
        }

        .linkedin-cloud-note strong {
          color: #1e3a8a;
        }

        .linkedin-generation-progress {
          margin-top: 2px;
          padding: 12px;
          border: 1px solid #dbeafe;
          border-radius: 10px;
          background: #fff;
        }

        .linkedin-progress-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 7px;
          font-size: 11px;
        }

        .linkedin-progress-stage {
          min-width: 0;
          font-weight: 700;
          color: #334155;
          overflow-wrap: anywhere;
        }

        .linkedin-progress-percent {
          flex: 0 0 auto;
          font-weight: 800;
          color: #1d4ed8;
        }

        .linkedin-variants {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 10px;
          border-top: 1px solid #f1f5f9;
        }

        .linkedin-variants-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }

        .linkedin-variants-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--li-muted);
        }

        .linkedin-badge-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .linkedin-badge {
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 10px;
          line-height: 1.3;
          font-weight: 700;
          overflow-wrap: anywhere;
        }

        .linkedin-variant {
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 12px;
          border: 1px solid var(--li-border-strong);
          border-radius: 8px;
          background: var(--li-surface-soft);
        }

        .linkedin-variant-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          font-size: 12px;
          line-height: 1.4;
          font-weight: 700;
        }

        .linkedin-variant-title {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .linkedin-variant-badge {
          flex: 0 0 auto;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          line-height: 1.3;
        }

        .linkedin-variant-details {
          padding: 10px;
          border: 1px solid var(--li-border);
          border-radius: 10px;
          background: #fff;
          color: #334155;
          font-size: 11px;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        .linkedin-variant-details > div {
          margin-bottom: 4px;
        }

        .linkedin-variant-details > div:last-child {
          margin-bottom: 0;
        }

        .linkedin-error {
          margin-top: 6px !important;
          color: #b91c1c;
        }

        .linkedin-link-btn {
          width: fit-content;
          max-width: 100%;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--li-blue);
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          text-align: left;
        }

        .linkedin-editor-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 12px;
          border: 1px solid var(--li-border);
          border-radius: 10px;
          background: var(--li-surface-soft);
        }

        .linkedin-toolbar-group {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 4px;
          min-width: 0;
        }

        .linkedin-toolbar-button {
          width: 32px;
          height: 32px;
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 0 8px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: #475569;
          font: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .linkedin-toolbar-button.has-label {
          width: auto;
        }

        .linkedin-toolbar-button.is-active {
          border-color: var(--li-blue);
          background: var(--li-blue-soft);
          color: var(--li-blue);
        }

        .linkedin-toolbar-button:hover {
          background: #fff;
        }

        .linkedin-toolbar-divider {
          width: 1px;
          height: 18px;
          margin: 0 4px;
          background: var(--li-border-strong);
        }

        .linkedin-symbol-bar {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 4px;
          padding: 3px 8px;
          border: 1px solid var(--li-border-strong);
          border-radius: 20px;
          background: #fff;
        }

        .linkedin-symbol {
          min-width: 26px;
          min-height: 26px;
          padding: 2px 4px;
          border: 0;
          border-radius: 4px;
          background: transparent;
          font-size: 14px;
          cursor: pointer;
        }

        .linkedin-symbol:hover {
          background: var(--li-blue-soft);
        }

        .linkedin-editor {
          min-height: 180px;
          padding: 12px;
          border: 1px solid var(--li-border-strong);
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .linkedin-editor .ProseMirror {
          min-height: 150px;
          outline: none;
          caret-color: var(--li-blue);
        }

        .linkedin-editor .ProseMirror-focused {
          outline: none;
        }

        .linkedin-editor .ProseMirror ::selection {
          background: #bfdbfe !important;
          color: #1e3a8a !important;
        }

        .linkedin-editor .ProseMirror p {
          margin: 0 0 10px;
        }

        .linkedin-editor .ProseMirror p:last-child {
          margin-bottom: 0;
        }

        .linkedin-editor .ProseMirror ul,
        .linkedin-editor .ProseMirror ol {
          margin: 8px 0;
          padding-left: 20px;
        }

        .linkedin-editor .ProseMirror li {
          margin-bottom: 6px;
        }

        .linkedin-editor .ProseMirror img {
          display: block;
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 12px 0;
          border: 1px solid var(--li-border-strong);
        }

        .linkedin-attached-image {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 14px;
          border: 1px solid var(--li-border-strong);
          border-radius: 8px;
          background: var(--li-surface-soft);
        }

        .linkedin-attached-image-label {
          min-width: 0;
          font-size: 12px;
          font-weight: 600;
          color: #334155;
        }

        .linkedin-attached-image-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }

        .linkedin-action-link {
          min-height: 34px;
          padding: 6px 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          border-radius: 6px;
          text-decoration: none;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }

        .linkedin-action-link-light {
          border: 1px solid var(--li-border-strong);
          background: #fff;
          color: var(--li-text);
        }

        .linkedin-action-link-dark {
          border: 0;
          background: var(--li-navy);
          color: #fff;
        }

        .linkedin-post-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .linkedin-post-action {
          min-height: 48px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 0;
          border-radius: 8px;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          text-align: center;
        }

        .linkedin-post-action-primary {
          background: var(--li-blue);
          color: #fff;
        }

        .linkedin-post-action-disabled {
          background: #94a3b8;
          color: #fff;
          cursor: not-allowed;
          opacity: .75;
        }

        .linkedin-preview-column {
          min-width: 0;
          position: sticky;
          top: 24px;
        }

        .linkedin-preview-card {
          overflow: hidden;
          border-color: var(--li-border-strong);
          box-shadow: 0 4px 12px rgba(0, 0, 0, .08);
        }

        .linkedin-preview-header {
          padding: 10px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          background: var(--li-navy);
          color: #fff;
          font-size: 12px;
          font-weight: 700;
        }

        .linkedin-preview-title {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }

        .linkedin-live-badge {
          flex: 0 0 auto;
          padding: 2px 8px;
          border-radius: 10px;
          background: #059669;
          color: #fff;
          font-size: 10px;
          line-height: 1.3;
          white-space: nowrap;
        }

        .linkedin-preview-body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .linkedin-profile-row {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .linkedin-profile-avatar {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: var(--li-blue);
          color: #fff;
        }

        .linkedin-profile-copy {
          min-width: 0;
        }

        .linkedin-profile-name {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
          font-size: 13px;
          line-height: 1.35;
          font-weight: 700;
          color: var(--li-navy);
        }

        .linkedin-profile-meta {
          font-size: 11px;
          line-height: 1.4;
          color: var(--li-muted);
        }

        .linkedin-profile-time {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          line-height: 1.4;
          color: #94a3b8;
        }

        .linkedin-preview-content {
          min-height: 120px;
          padding-top: 12px;
          border-top: 1px solid #f1f5f9;
          color: #1e293b;
          font-size: 13px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .linkedin-preview-content .linkedin-paragraph {
          margin: 0 0 10px;
        }

        .linkedin-preview-content .linkedin-list {
          margin: 8px 0;
          padding-left: 20px;
        }

        .linkedin-preview-content .linkedin-list-item {
          margin-bottom: 6px;
        }

        .linkedin-preview-content img {
          display: block;
          max-width: 100%;
          height: auto;
          border-radius: 8px;
        }

        .linkedin-preview-empty {
          color: #94a3b8;
          font-style: italic;
        }

        .linkedin-engagement {
          padding-top: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          border-top: 1px solid #f1f5f9;
          color: var(--li-muted);
          font-size: 11px;
        }

        .linkedin-reactions {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .linkedin-like {
          padding: 2px;
          border-radius: 50%;
          background: var(--li-blue);
          color: #fff;
          font-size: 8px;
        }

        .linkedin-workspace button:disabled {
          cursor: not-allowed;
        }

        @media (max-width: 1080px) {
          .linkedin-layout {
            grid-template-columns: minmax(0, 1fr) minmax(290px, .78fr);
            gap: 18px;
          }

          .linkedin-ai-mode-row {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 860px) {
          .linkedin-workspace {
            padding: 16px;
          }

          .linkedin-layout {
            grid-template-columns: 1fr;
          }

          .linkedin-preview-column {
            position: static;
          }

          .linkedin-header {
            align-items: flex-start;
          }

          .linkedin-header .linkedin-btn {
            width: 100%;
          }

          .linkedin-ai-grid,
          .linkedin-custom-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .linkedin-workspace {
            padding: 10px;
          }

          .linkedin-shell {
            gap: 12px;
          }

          .linkedin-header {
            padding: 14px;
            border-radius: 12px;
          }

          .linkedin-brand {
            align-items: flex-start;
          }

          .linkedin-brand-mark {
            width: 38px;
            height: 38px;
            flex-basis: 38px;
          }

          .linkedin-title {
            font-size: 16px;
          }

          .linkedin-subtitle {
            font-size: 11px;
          }

          .linkedin-card,
          .linkedin-auth-card {
            padding: 14px;
            border-radius: 12px;
          }

          .linkedin-status {
            align-items: flex-start;
            padding: 10px 12px;
          }

          .linkedin-status > span {
            min-width: 0;
            overflow-wrap: anywhere;
          }

          .linkedin-card-header,
          .linkedin-variants-heading {
            align-items: flex-start;
          }

          .linkedin-browser-status-row {
            align-items: flex-start;
            flex-direction: column;
          }

          .linkedin-browser-actions {
            width: 100%;
            justify-content: flex-start;
            flex-wrap: wrap;
          }

          .linkedin-editor-toolbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .linkedin-toolbar-group,
          .linkedin-symbol-bar {
            width: 100%;
          }

          .linkedin-toolbar-group {
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 2px;
            scrollbar-width: thin;
          }

          .linkedin-symbol-bar {
            overflow-x: auto;
            flex-wrap: nowrap;
            scrollbar-width: thin;
          }

          .linkedin-attached-image {
            align-items: flex-start;
            flex-direction: column;
          }

          .linkedin-attached-image-actions {
            width: 100%;
            justify-content: stretch;
          }

          .linkedin-attached-image-actions > * {
            flex: 1 1 140px;
          }

          .linkedin-post-actions {
            grid-template-columns: 1fr;
          }

          .linkedin-preview-body {
            padding: 14px;
          }

          .linkedin-live-badge {
            display: none;
          }
        }

        @media (max-width: 420px) {
          .linkedin-workspace {
            padding: 6px;
          }

          .linkedin-card,
          .linkedin-auth-card {
            padding: 12px;
          }

          .linkedin-ai-config,
          .linkedin-options-panel {
            padding: 11px;
          }

          .linkedin-variant-heading {
            flex-direction: column;
          }

          .linkedin-variant-badge {
            align-self: flex-start;
          }

          .linkedin-profile-row {
            align-items: flex-start;
          }
        }
      `}</style>

      <div className="linkedin-shell">
        <header className="linkedin-header">
          <div className="linkedin-brand">
            <div className="linkedin-brand-mark" aria-hidden="true">
              <Building2 size={22} />
            </div>
            <div className="linkedin-brand-copy">
              <h1 className="linkedin-title">LinkedIn Posts Draft Creator</h1>
              <p className="linkedin-subtitle">Voice-Driven LinkedIn Draft & Content Engine</p>
            </div>
          </div>

          <button
            type="button"
            className="linkedin-btn linkedin-btn-dark"
            onClick={() => setShowAuthConfig(!showAuthConfig)}
          >
            <Key size={14} />
            <span>API Credentials & Auth Info for Direct Publishing</span>
          </button>
        </header>

        {showAuthConfig && (
          <div className="linkedin-auth-card">
            <div className="linkedin-card-header">
              <h3 className="linkedin-card-title linkedin-auth-title">
                API Credentials & Auth Info for Direct Publishing
              </h3>
              <button
                type="button"
                className="linkedin-icon-btn"
                onClick={() => setShowAuthConfig(false)}
                aria-label="Close API credentials information"
              >
                ✕
              </button>
            </div>
            <p className="linkedin-body-copy">
              Direct API publishing requires an authorized OAuth URN and Client Secret.
              <strong> Send a direct message to info@sunarctechnologies.com to enable direct background publishing.</strong>
            </p>
          </div>
        )}

        {statusMessage && (
          <div className={`linkedin-status linkedin-status-${statusMessage.type}`}>
            <span>{statusMessage.text}</span>
            <button
              type="button"
              className="linkedin-icon-btn"
              onClick={() => setStatusMessage(null)}
              aria-label="Dismiss status message"
            >
              ✕
            </button>
          </div>
        )}

        <div className="linkedin-layout">
          <div className="linkedin-main-column">
            {/* DRAFT GENERATOR */}
            <section className="linkedin-card">
              <div className="linkedin-card-header">
                <span className="linkedin-card-title">1. Fast Draft Generator for LinkedIn Post</span>
              </div>

              <div className="linkedin-field">
                <label className="linkedin-label">Speak about topic you want to Post</label>
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`linkedin-voice-btn${isListening ? ' is-listening' : ''}`}
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} style={{ color: '#0066c2' }} />}
                  <span>{isListening ? 'Listening... Click to Stop Dictation' : '🎙️ Tap to Dictate Notes / Context'}</span>
                </button>
              </div>

              <div className="linkedin-field">
                <label className="linkedin-label">Add Additional context or Type your topic details directly</label>
                <textarea
                  className="linkedin-textarea"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Speak or type notes here..."
                  rows={3}
                />
              </div>

              <div className="linkedin-options-panel">
                <div className="linkedin-field">
                  <label className="linkedin-label">Select Tone</label>
                  <div className="linkedin-chip-list">
                    {tonesList.map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => setSelectedTone(tone)}
                        className={`linkedin-chip${selectedTone === tone ? ' is-selected' : ''}`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* CLOUD AI PROVIDER & KEYS CONFIGURATION BOX */}
              <div className="linkedin-ai-config">
                <div className="linkedin-ai-mode-row">
                  <span className="linkedin-ai-mode-label">AI Generation Mode</span>
                  <select
                    value={aiMode}
                    onChange={(e) => setAiMode(e.target.value as 'auto' | 'cloud' | 'demo')}
                    className="linkedin-select"
                    aria-label="AI generation mode"
                  >
                    <option value="auto">Auto — Browser AI → Demo fallback</option>
                    <option value="cloud">Cloud AI — My API Key</option>
                    <option value="demo" disabled={!demoAvailable}>
                      Demo Mode — Server AI{demoAvailable ? '' : ' (not configured)'}
                    </option>
                  </select>
                </div>

                <div className="linkedin-ai-grid">
                  <div className="linkedin-field">
                    <label className="linkedin-label linkedin-label-small">Cloud Provider</label>
                    <select
                      value={cloudProvider}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      className="linkedin-select"
                    >
                      {CLOUD_PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                      <option value="custom">Custom Provider</option>
                    </select>
                  </div>

                  <div className="linkedin-field">
                    <label className="linkedin-label linkedin-label-small">Target Model</label>
                    <select
                      value={cloudModel}
                      onChange={(e) => setCloudModel(e.target.value)}
                      className="linkedin-select"
                    >
                      {CLOUD_PROVIDERS.find((p) => p.id === cloudProvider)?.models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      {cloudProvider === 'custom' && (
                        <option value={customModel}>{customModel || 'Enter custom model below'}</option>
                      )}
                    </select>
                  </div>
                </div>

                {cloudProvider === 'custom' && (
                  <div className="linkedin-custom-grid">
                    <div className="linkedin-field">
                      <label className="linkedin-label linkedin-label-small">Provider ID / Name</label>
                      <input
                        className="linkedin-input"
                        value={customProvider}
                        onChange={(e) => setCustomProvider(e.target.value)}
                        placeholder="e.g. groq, mistral, deepseek"
                      />
                    </div>
                    <div className="linkedin-field">
                      <label className="linkedin-label linkedin-label-small">Model ID</label>
                      <input
                        className="linkedin-input"
                        value={customModel}
                        onChange={(e) => {
                          setCustomModel(e.target.value);
                          setCloudModel(e.target.value);
                        }}
                        placeholder="e.g. llama-3.3-70b-versatile"
                      />
                    </div>
                  </div>
                )}

                {aiMode === 'cloud' && (
                  <div className="linkedin-field">
                    <label className="linkedin-label linkedin-label-small">Optional Custom API Key (In-Memory Only)</label>
                    <div className="linkedin-key-wrap">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        className="linkedin-input linkedin-key-input"
                        value={cloudApiKey}
                        onChange={(e) => setCloudApiKey(e.target.value)}
                        placeholder={`Enter ${CLOUD_PROVIDERS.find(p => p.id === cloudProvider)?.name} API Key (e.g. sk-...)`}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="linkedin-key-toggle"
                        onClick={() => setShowApiKey(!showApiKey)}
                        title={showApiKey ? 'Hide Key' : 'Show Key'}
                        aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                      >
                        {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <span className="linkedin-help-text">
                      Your key is sent only for this generation and is not stored by the UI.
                    </span>
                  </div>
                )}

                {aiMode === 'demo' && (
                  <div className="linkedin-info-box">
                    <strong>Demo Mode:</strong> uses the application's server-side AI key. Availability depends on the configured provider quota. Your API key is not required.
                    {demoProviders.length > 0 && <span> Server providers: {demoProviders.join(', ')}.</span>}
                  </div>
                )}
              </div>

              {/* BROWSER AI STATUS / SETUP */}
              {aiMode === 'auto' && (
                <div className={`linkedin-browser-status ${browserAiStatus === 'ready' ? 'is-ready' : 'is-pending'}`}>
                  <div className="linkedin-browser-status-row">
                    <div className="linkedin-browser-status-copy">
                      {browserAiStatus === 'ready'
                        ? <CheckCircle2 size={15} color="#15803d" />
                        : <Sparkles size={15} color="#b45309" />}
                      <div className="linkedin-browser-status-text">
                        <div className="linkedin-browser-status-title">
                          Browser AI: {browserAiStatus === 'ready' ? 'Ready' : 'Not ready'}
                        </div>
                        <div className="linkedin-browser-status-message">{browserAiMessage}</div>
                      </div>
                    </div>

                    <div className="linkedin-browser-actions">
                      {browserAiStatus !== 'ready' && (
                        <button
                          type="button"
                          className="linkedin-mini-btn"
                          onClick={() => void checkBrowserAi(true)}
                          disabled={browserAiStatus === 'checking' || browserAiStatus === 'downloading'}
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
                        className="linkedin-mini-link"
                        onClick={() => setShowBrowserAiHelp((value) => !value)}
                      >
                        {showBrowserAiHelp ? 'Hide help' : 'How does this work?'}
                      </button>
                    </div>
                  </div>

                  {browserAiStatus === 'downloading' && (
                    <div className="linkedin-download-progress">
                      <div className="linkedin-progress-meta">
                        <span>Local AI model download</span>
                        <span>{browserAiDownloadProgress}%</span>
                      </div>
                      <div className="linkedin-progress-track">
                        <div
                          className="linkedin-progress-fill linkedin-download-fill"
                          style={{ width: `${browserAiDownloadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {showBrowserAiHelp && (
                    <div className="linkedin-browser-help">
                      <strong className="strong">Browser AI runs locally when supported.</strong>
                      <div>
                        You generally do not need to install a separate AI extension for Chrome's built-in AI.
                        The browser manages the local model download when the API and device are eligible.
                      </div>
                      <div>
                        For the Prompt API, support depends on the browser version, operating system,
                        device hardware, available storage, and the current Chrome AI rollout.
                      </div>
                      <div className="strong">
                        In Auto mode, the app uses Browser AI when available and automatically falls back to Cloud AI when it is not.
                      </div>
                      <div>
                        For Chrome diagnostics, open <code>chrome://on-device-internals</code> and check the AI model/event logs.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {aiMode === 'cloud' && (
                <div className="linkedin-cloud-note">
                  <strong>Cloud AI only</strong>
                  <span> Browser AI will not be used for this generation.</span>
                </div>
              )}

              <button
                type="button"
                className="linkedin-btn linkedin-btn-primary"
                onClick={generateMultiVariants}
                disabled={isGenerating}
              >
                <Sparkles size={16} />
                <span>{isGenerating ? 'Generating Variants...' : 'Generate Content Variants'}</span>
              </button>

              {/* AI GENERATION PROGRESS */}
              {generationProgress > 0 && (
                <div className="linkedin-generation-progress">
                  <div className="linkedin-progress-heading">
                    <span className="linkedin-progress-stage">{generationStage || 'Generating AI variants...'}</span>
                    <span className="linkedin-progress-percent">{generationProgress}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={generationProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={generationStage || 'AI generation progress'}
                    className="linkedin-progress-track"
                  >
                    <div
                      className="linkedin-progress-fill"
                      style={{ width: `${generationProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* VARIANTS DISPLAY */}
              {variants.length > 0 && (
                <div className="linkedin-variants">
                  <div className="linkedin-variants-heading">
                    <span className="linkedin-variants-label">GENERATED VARIANTS:</span>
                    <div className="linkedin-badge-row">
                      <span className="linkedin-badge" style={{
                        backgroundColor: browserAiStatus === 'ready'
                          ? '#dcfce7'
                          : browserAiStatus === 'unavailable'
                          ? '#f1f5f9'
                          : '#eff6ff',
                        color: browserAiStatus === 'ready' ? '#166534' : '#475569',
                      }}>
                        {aiMode === 'cloud'
                          ? 'Browser AI not used'
                          : browserAiStatus === 'ready'
                          ? `${getBrowserAiModelName()} Ready`
                          : browserAiStatus === 'downloading'
                          ? `Browser AI Downloading ${browserAiDownloadProgress}%`
                          : browserAiStatus === 'downloadable'
                          ? 'Browser AI Model Ready to Download'
                          : browserAiStatus === 'checking'
                          ? 'Checking Browser AI'
                          : 'Browser AI Unavailable — Cloud fallback'}
                      </span>
                      <span className="linkedin-badge" style={{
                        backgroundColor: generationMode === 'browser'
                          ? '#fef3c7'
                          : generationMode === 'cloud'
                          ? '#e0f2fe'
                          : '#f3f4f6',
                        color: generationMode === 'browser'
                          ? '#92400e'
                          : generationMode === 'cloud'
                          ? '#075985'
                          : '#374151',
                      }}>
                        {generationMode === 'browser'
                          ? 'Final: Browser AI'
                          : generationMode === 'cloud'
                          ? 'Final: Cloud'
                          : generationMode === 'template'
                          ? 'Final: Template'
                          : 'Final: Pending'}
                      </span>
                    </div>
                  </div>

                  {variants.map((v) => (
                    <div key={v.id} className="linkedin-variant">
                      <div className="linkedin-variant-heading">
                        <span className="linkedin-variant-title">{v.title}</span>
                        <span
                          className="linkedin-variant-badge"
                          style={{
                            backgroundColor: v.details?.success ? '#dbeafe' : '#fee2e2',
                            color: v.details?.success ? '#1e40af' : '#991b1b',
                          }}
                        >
                          {v.badge}
                        </span>
                      </div>

                      {v.details && (
                        <div className="linkedin-variant-details">
                          <div><strong>Provider / Model:</strong> {v.details.provider} / {v.details.model || 'default'}</div>
                          {v.details.usage && (
                            <div>
                              <strong>Tokens:</strong> {v.details.usage.prompt_tokens ?? '-'} prompt / {v.details.usage.completion_tokens ?? '-'} completion / {v.details.usage.total_tokens ?? '-'} total
                            </div>
                          )}
                          {v.details.rateLimit && (
                            <div>
                              <strong>Rate Limit:</strong> {Object.entries(v.details.rateLimit).map(([key, value]) => `${key}: ${value}`).join(' • ')}
                            </div>
                          )}
                          {v.details.params && (
                            <div>
                              <strong>Params:</strong> T={v.details.params.temperature ?? '-'} / max={v.details.params.max_tokens ?? '-'}
                            </div>
                          )}
                          <div><strong>Time:</strong> {v.details.timeMs ?? '-'} ms</div>
                          {v.details.error && (
                            <div className="linkedin-error"><strong>Error:</strong> {v.details.error}</div>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        className="linkedin-link-btn"
                        onClick={() => applyVariantToEditor(v.contentHtml)}
                      >
                        ✓ Load into Post Canvas
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* CANVAS EDITOR */}
            <section className="linkedin-card">
              <div className="linkedin-card-header">
                <span className="linkedin-card-title">2. Post Canvas Editor</span>
                <span
                  style={{
                    fontSize: '11px',
                    color: plainText.length > LINKEDIN_MAX_CHARS ? '#dc2626' : '#64748b',
                    fontWeight: plainText.length > LINKEDIN_MAX_CHARS ? '700' : 'normal',
                  }}
                >
                  Characters: <strong>{plainText.length}</strong> / {LINKEDIN_MAX_CHARS} max
                </span>
              </div>

              {editor && (
                <div className="linkedin-editor-toolbar">
                  <div className="linkedin-toolbar-group">
                    <button
                      type="button"
                      className={`linkedin-toolbar-button${editor.isActive('bold') ? ' is-active' : ''}`}
                      onClick={() => editor.chain().focus().toggleBold().run()}
                      aria-label="Bold"
                    >
                      <Bold size={15} />
                    </button>
                    <button
                      type="button"
                      className={`linkedin-toolbar-button${editor.isActive('italic') ? ' is-active' : ''}`}
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                      aria-label="Italic"
                    >
                      <Italic size={15} />
                    </button>
                    <button
                      type="button"
                      className={`linkedin-toolbar-button${editor.isActive('link') ? ' is-active' : ''}`}
                      onClick={handleAddLink}
                      aria-label="Add link"
                    >
                      <LinkIcon size={15} />
                    </button>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/*"
                      style={{ display: 'none' }}
                    />

                    <button
                      type="button"
                      className="linkedin-toolbar-button has-label is-active"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon size={15} />
                      <span>Add Image</span>
                    </button>

                    <div className="linkedin-toolbar-divider" />

                    <button
                      type="button"
                      className={`linkedin-toolbar-button${editor.isActive('bulletList') ? ' is-active' : ''}`}
                      onClick={() => editor.chain().focus().toggleBulletList().run()}
                      aria-label="Bullet list"
                    >
                      <List size={15} />
                    </button>
                    <button
                      type="button"
                      className={`linkedin-toolbar-button${editor.isActive('orderedList') ? ' is-active' : ''}`}
                      onClick={() => editor.chain().focus().toggleOrderedList().run()}
                      aria-label="Ordered list"
                    >
                      <ListOrdered size={15} />
                    </button>
                  </div>

                  <div className="linkedin-symbol-bar">
                    <Smile size={14} style={{ color: '#0066c2', flex: '0 0 auto' }} />
                    {emojiAndSymbolsList.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className="linkedin-symbol"
                        onClick={() => insertSymbolAtCursor(item)}
                        aria-label={`Insert ${item}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="linkedin-editor">
                <EditorContent editor={editor} />
              </div>

              {attachedImageUrl && (
                <div className="linkedin-attached-image">
                  <span className="linkedin-attached-image-label">🖼️ Attached Canvas Image:</span>
                  <div className="linkedin-attached-image-actions">
                    <button
                      type="button"
                      className="linkedin-action-link linkedin-action-link-light"
                      onClick={copyImageToClipboard}
                    >
                      <Copy size={13} /> Copy Image
                    </button>
                    <a
                      href={attachedImageUrl}
                      download="linkedin-post-image.png"
                      className="linkedin-action-link linkedin-action-link-dark"
                    >
                      <Download size={13} /> Download
                    </a>
                  </div>
                </div>
              )}

              <div className="linkedin-post-actions">
                <button
                  type="button"
                  className="linkedin-post-action linkedin-post-action-primary"
                  onClick={handleManualPost}
                >
                  <ExternalLink size={16} />
                  <span>Copy Text & Open LinkedIn App</span>
                </button>

                <button
                  type="button"
                  className="linkedin-post-action linkedin-post-action-disabled"
                  disabled
                >
                  <Lock size={15} />
                  <span>Publish Direct API (DM to Unlock)</span>
                </button>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: PREVIEW */}
          <aside className="linkedin-preview-column">
            <div className="linkedin-preview-card">
              <div className="linkedin-preview-header">
                <span className="linkedin-preview-title">
                  <Eye size={14} style={{ color: '#38bdf8' }} />
                  <span>Live Post Canvas</span>
                </span>
                <span className="linkedin-live-badge">Real-time Preview</span>
              </div>

              <div className="linkedin-preview-body">
                <div className="linkedin-profile-row">
                  <div className="linkedin-profile-avatar" aria-hidden="true">
                    <Building2 size={20} />
                  </div>
                  <div className="linkedin-profile-copy">
                    <div className="linkedin-profile-name">
                      <span>Enterprise Cloud Solutions</span>
                      <CheckCircle2 size={13} style={{ color: '#0066c2', flex: '0 0 auto' }} />
                    </div>
                    <div className="linkedin-profile-meta">14,200 followers • Promoted</div>
                    <div className="linkedin-profile-time">
                      <span>Just now •</span>
                      <Globe size={10} />
                    </div>
                  </div>
                </div>

                <div className="linkedin-preview-content">
                  {editorHtml && editorHtml !== '<p></p>' ? (
                    <div dangerouslySetInnerHTML={{ __html: editorHtml }} />
                  ) : (
                    <span className="linkedin-preview-empty">
                      Your generated content will dynamically render here...
                    </span>
                  )}
                </div>

                <div className="linkedin-engagement">
                  <div className="linkedin-reactions">
                    <span className="linkedin-like">👍</span>
                    <span><strong>1,420</strong></span>
                  </div>
                  <div>48 comments • 12 reposts</div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
