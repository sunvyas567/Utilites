declare global {
  var LanguageModel: any;
  interface Window {
    ai?: any;
    LanguageModel?: any;
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}
import React, { useState, useEffect, useRef} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
//import { WorkspaceProps, PostData } from '../types/linkedin';
//import { PostEditor } from '../components/PostEditor';
//import { PostPreview } from '../components/PostPreview';
//import { AiControlTab } from '../components/AiControlsTab';
//import { convertToLinkedInUnicode } from '../utils/unicodeUtils';
//import { useVoiceDictation } from '../hooks/useVoiceDictation';
//import { checkBrowserAiAvailability, generateWithBrowserAi } from '../services/aiService';

import { 
  Sparkles, Mic, MicOff, ShieldCheck, Zap, ArrowRight, 
  Layout, Key, Edit3, Eye, FileText, Bot, Sliders,EyeOff,CheckCircle2,RefreshCw
} from 'lucide-react';
import { 
  Bold, Italic, Lock, 
  ExternalLink,Link as LinkIcon, Image as ImageIcon, ThumbsUp,Globe,MessageSquare,Repeat2,
  SendHorizontal,Building2,X,AlertCircle,ChevronLeft, ChevronRight
} from 'lucide-react';

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


const LINKEDIN_MAX_CHARS = 3000;
const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8000';

// Fallback constants for context selection & tones
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
const tonesList = ['Professional', 'Action-Oriented', 'Storytelling', 'Bold / Thought-Provoking', 'Conversational', 'Empathetic'];

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
        const availability = await globalLM.availability(
          {
            expectedOutputs: [
              { type: "text", languages: ["en"] } // Supported: 'de', 'en', 'es', 'fr', 'ja'
            ]
          }
        );
        console.log("availability: ", availability);

        if (availability === 'available' || availability === 'readily') {
          return { status: 'ready', message: 'Local AI is available.', availability };
        }

        if (availability === 'downloadable' || availability === 'after-download') {
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
      const getAvailability = async () => {
        const options = {
          expectedOutputs: [{ type: "text", languages: ["en"] }]
        };

        if (typeof aiObj.languageModel.availability === 'function') {
          return await aiObj.languageModel.availability(options);
        }
        if (typeof aiObj.languageModel.capabilities === 'function') {
          const caps = await aiObj.languageModel.capabilities(options);
          return caps?.available;
        }
        return null;
      };
  

      const available = await getAvailability();
      console.log("aiObj availability: ", available);

      if (available === 'readily' || available === 'available') {
        return { status: 'ready', message: 'Local AI is available.', availability: available };
      }

      if (available === 'after-download' || available === 'downloadable') {
        return {
          status: 'downloadable',
          message: 'Local AI is supported, but the local model needs to be prepared.',
          availability: available,
        };
      }

      if (available === 'downloading') {
        return {
          status: 'downloading',
          message: 'Local AI is preparing the local model.',
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
        ? await globalLM.availability({
          expectedOutputs: [
            { type: "text", languages: ["en"] } // Supported: 'de', 'en', 'es', 'fr', 'ja'
          ]
        })
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

        return await globalLM.create({ monitor },
          {
            expectedInputs: [
              { type: "text", languages: ["en"] }
            ],
            expectedOutputs: [
              { type: "text", languages: ["en"] }
            ]
          }
        );
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

      return await aiObj.languageModel.create({
        expectedInputs: [
          { type: "text", languages: ["en"] }
        ],
        expectedOutputs: [
          { type: "text", languages: ["en"] }
        ]
      });
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

// --- Helper: Sentence Boundary Sanitizer ---
const sanitizeIncompleteSentence = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed || /[.!?:]["']?$/.test(trimmed)) return trimmed;

  // Find the last clean sentence terminator
  const lastIndex = Math.max(
    trimmed.lastIndexOf('.'),
    trimmed.lastIndexOf('!'),
    trimmed.lastIndexOf('?')
  );

  return lastIndex !== -1 ? trimmed.slice(0, lastIndex + 1) : trimmed;
};
// --- 1. Browser AI Generator with Auto-Continuation ---
// 1. Pass existing session into generateWithBrowserAi
export const generateWithBrowserAi = async (
  topicText: string,
  goal: string,
  tone: string,
  styleFormat: 'story' | 'list',
  onChunk?: (text: string) => void,
  existingSession?: any // Pass active session here
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
    // Reuse passed session or fallback to session initialization
    const session = existingSession || (await getBrowserAiSession());
    if (!session) {
      details.error = 'Local AI session is unavailable.';
      return { text: '', details };
    }
    let accumulated = '';
    let currentPrompt = prompt;
    let continuationAttempts = 0;
    const maxContinuations = 2;
    let isComplete = false;
    let lastResultObj: any = null;

    // Auto-continuation loop to handle token caps or context cutoffs
    while (!isComplete && continuationAttempts <= maxContinuations) {
      let segmentText = '';

      if (typeof session.promptStreaming === 'function') {
        const stream = await session.promptStreaming(currentPrompt);
        for await (const chunk of stream as any) {
          lastResultObj = chunk;
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
            segmentText += piece;
            onChunk?.(accumulated + segmentText);
          }

          if (chunk?.usage) details.usage = chunk.usage;
          if (chunk?.model || chunk?.modelId) details.model = chunk.model || chunk.modelId;
        }
      } else if (typeof session.prompt === 'function') {
        const res = await session.prompt(currentPrompt);
        lastResultObj = res;
        segmentText = typeof res === 'string' ? res : res?.text || res?.outputText || res?.content || '';
      } else if (typeof session.generateContent === 'function') {
        const res = await session.generateContent(currentPrompt);
        lastResultObj = res;
        segmentText = typeof res === 'string' ? res : res?.text || res?.outputText || res?.content || '';
      }

      accumulated += segmentText;
      const trimmed = accumulated.trim();

      // Check if text ends cleanly with terminal punctuation
      if (!trimmed || /[.!?:]["']?$/.test(trimmed) || !segmentText.trim()) {
        isComplete = true;
      } else {
        continuationAttempts++;
        if (continuationAttempts <= maxContinuations) {
          // Trigger continuation prompt from the exact cutoff tail
          const snippet = trimmed.slice(-60);
          currentPrompt = `Continue writing directly from this exact cutoff point: "${snippet}"`;
        }
      }
    }

    // Sanitize trailing incomplete sentence as a final fallback
    accumulated = sanitizeIncompleteSentence(accumulated);
    onChunk?.(accumulated);

    const end = performance.now();
    details.timeMs = Math.round(end - start);

    details.model = lastResultObj?.model || lastResultObj?.modelId || lastResultObj?.provider || details.model || 'browser';
    details.usage = lastResultObj?.usage || lastResultObj?.usageStats || lastResultObj?.tokenUsage || details.usage || undefined;
    details.rateLimit = lastResultObj?.rate_limit || lastResultObj?.rateLimit || undefined;
    details.success = Boolean(accumulated?.trim());

    if (!details.success) {
      details.error = lastResultObj?.error || lastResultObj?.message || 'Local AI returned no text.';
    }

    return { text: accumulated.trim(), details };
  } catch (error: any) {
    const end = performance.now();
    details.timeMs = Math.round(end - start);
    details.error = error?.message || String(error);
    return { text: '', details };
  }
};

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

function LinkedInWorkspace () {
  const [currentView, setCurrentView] = useState<'landing' | 'workspace'>('landing');
  const [showAuthConfig, setShowAuthConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<'inputs' | 'ai' | 'editor' | 'preview'>('inputs');
  const [htmlContent, setHtmlContent] = useState('');
  const [unicodeContent, setUnicodeContent] = useState('');
  const [selectedModel, setSelectedModel] = useState('chrome-nano');
  const [isLocalAiReady, setIsLocalAiReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // User Inputs Tab States
  const [meetingContext, setMeetingContext] = useState('general');
  const [prompt, setPrompt] = useState('');
  const [selectedTone, setSelectedTone] = useState('Professional');

  const [variants, setVariants] = useState<VariantOption[]>([]);

  // Tab state for mobile viewport layout switching ('editor' | 'preview')
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  
  // Cloud Provider & API Key States
  const [cloudProvider, setCloudProvider] = useState<string>('gemini');
  const [cloudModel, setCloudModel] = useState<string>('gemini-2.5-flash');
  const [cloudApiKey, setCloudApiKey] = useState<string>('');
  const [customProvider, setCustomProvider] = useState<string>('');
  const [customModel, setCustomModel] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

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

  const tabsNavRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
  if (tabsNavRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsNavRef.current;
      const maxScroll = scrollWidth - clientWidth;

      // 1. Show left arrow if scrolled more than 3px from start
      setCanScrollLeft(scrollLeft > 3);

      // 2. Hide right arrow when within 10px of the end (handles zoom/device scaling)
      setCanScrollRight(scrollLeft < maxScroll - 10);
    }
  //if (tabsNavRef.current) {
   // const { scrollLeft, scrollWidth, clientWidth } = tabsNavRef.current;
    // 5px buffer to handle sub-pixel rendering differences
  //  setCanScrollLeft(scrollLeft > 5);
   // setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
  //}
  };

  useEffect(() => {
    checkScroll();
    // Re-check after 200ms to capture late browser rendering
    // 2. Delayed check to wait for browser layout computation
    const timer = setTimeout(() => {
      checkScroll();
    }, 200);

    window.addEventListener('resize', checkScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkScroll);
    };
  //  const navEl = tabsNavRef.current;
   // if (navEl) {
    //  navEl.addEventListener('scroll', checkScroll);
    //  window.addEventListener('resize', checkScroll);
   //   return () => {
       // navEl.removeEventListener('scroll', checkScroll);
     //   window.removeEventListener('resize', checkScroll);
    //  };
   // }
    
  }, []);


  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsNavRef.current) {
      const scrollAmount = direction === 'left' ? -180 : 180;
      tabsNavRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }

    // Re-evaluate arrows during and after smooth scroll animation completes
      setTimeout(checkScroll, 150);
      setTimeout(checkScroll, 350);
  };

  const handleContentChange = (newHtml: string) => {
    setHtmlContent(newHtml);
    setUnicodeContent(convertHtmlToLinkedInText(newHtml));
  };

  

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

  const toggleListening = () => {
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
      setHtmlContent(rawHtml); // <-- Add this to fix Live Preview
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

    if (result.status === 'unsupported') {
      const ua = navigator.userAgent;
      
      const isIOS = /iPhone|iPad|iPod/i.test(ua);
      const isEdge = /Edg|EdgiOS/i.test(ua);
      const isChrome = /Chrome|Chromium|CriOS/i.test(ua);
      const isFirefox = /Firefox|FxiOS/i.test(ua);

      let browserName = 'this browser';
      if (isEdge) {
        browserName = isIOS ? 'Edge on iOS' : 'Edge';
      } else if (isChrome) {
        browserName = isIOS ? 'Chrome on iOS' : 'Chrome';
      } else if (isFirefox) {
        browserName = isIOS ? 'Firefox on iOS' : 'Firefox';
      } else if (/Safari/i.test(ua)) {
        browserName = 'Safari';
      }

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
    // 1. Copy draft to clipboard
    await navigator.clipboard.writeText(plainText);
    setStatusMessage({ type: 'success', text: '📋 Draft copied! Opening LinkedIn...' });

    // 2. Open or reuse existing LinkedIn tab using a named target
    const link = document.createElement('a');
    link.href = 'https://www.linkedin.com/feed/';
    
    // Using a named target reuses the tab if it was opened by your app
    link.target = 'linkedin_workspace_tab'; 
    link.rel = 'noopener';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

  } catch (err) {
    setStatusMessage({ type: 'error', text: 'Clipboard copy failed.' });
  }
};
  const handleManualPostOld1 = async () => {
  if (!plainText) {
    setStatusMessage({ type: 'error', text: 'Draft content cannot be empty.' });
    return;
  }

  // 1. Open the new tab immediately while user click gesture is active
  const newTab = window.open('https://www.linkedin.com/feed/', '_blank');

  try {
    // 2. Perform the async copy operation
    await navigator.clipboard.writeText(plainText);
    setStatusMessage({ type: 'success', text: '📋 Draft copied! Opening LinkedIn...' });
    
    // 3. Fallback direct navigation if popup was suppressed/blocked
    if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
      window.location.href = 'https://www.linkedin.com/feed/';
    }
  } catch (err) {
    // Close the opened tab if the copy operation failed
    if (newTab) newTab.close();
    setStatusMessage({ type: 'error', text: 'Clipboard copy failed.' });
  }
};
  const handleManualPostOld = async () => {
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

  const formatUserFriendlyError = (err: string, provider?: string): string => {
  // If the error originated explicitly from browser AI, do not check for API keys
  if (provider === 'browser') {
    return `Local Browser AI error: ${err}`;
  }

  const lowerErr = err.toLowerCase();
  
  // Use specific boundary matching instead of raw 'key'
  const isAuthError = 
    lowerErr.includes('401') || 
    lowerErr.includes('403') || 
    /\bapi_key\b|\bapikey\b|\bunauthorized\b|\binvalid api key\b/.test(lowerErr);
  // Use exact matching or word boundaries for API key checks

  if (isAuthError) {
    return 'Authentication failed. Please verify your API key and configuration.';
  }

   if (err.includes('429') || err.includes('quota') || err.includes('rate')) {
      return 'The AI service is currently busy. Please wait a moment and try again.';
    }
   if (err.includes('500') || err.includes('502') || err.includes('503') || err.includes('overloaded')) {
      return 'The server AI service is temporarily unavailable. Please try again shortly.';
    }
    return 'Generation failed due to a server error. Please try again.';

  //return err;
};
  const generateMultiVariants = async () => {

    const contextText = prompt.trim();
    
    // Guard: Halt generation if prompt/voice input is empty
    if (!contextText) {
      setStatusMessage({ 
        type: 'error', 
        text: 'Please enter a topic or record voice input before generating.' 
      });
      return;
    }

    
    setIsGenerating(true);
    setVariants([]);
    updateGenerationProgress(5, 'Preparing AI generation...');
    //const contextText = prompt.trim() || 'General Corporate Update';
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
      badge: details?.error 
        ? 'Failed' 
        : details?.success 
        ? (details.provider === 'browser' ? 'Local AI' : (aiMode === 'demo' ? 'Demo Mode Server AI' : `Cloud AI (${details.provider})`)) 
        : 'Generating...',
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
          contextText, 
          computedGoal, 
          computedTone, 
          'story',
          (partial) => {
            const progress = Math.min(45, 20 + Math.floor(partial.length / 30));
            updateGenerationProgress(progress, 'Local AI — streaming draft...');
          },
          browserSession // Pass active session object directly!
        );
        
        updateGenerationProgress(82, 'Local AI — draft complete...');
      }
      //if (useBrowserAi && browserSession) {
      //  updateGenerationProgress(12, 'Local AI ready — generating draft...');

      //  updateGenerationProgress(20, 'Local AI — streaming draft...');
      //  storyBrowser = await generateWithBrowserAi(
      //    contextText, computedGoal, computedTone, 'story',
      //    (partial) => {
      //      const progress = Math.min(45, 20 + Math.floor(partial.length / 30));
      //      updateGenerationProgress(progress, 'Local AI — streaming draft...');
      //    }
      //  );
      //  updateGenerationProgress(82, 'Local AI — draft complete...');
      //}

      // --- 2. Cloud SSE Stream Handler with Completion Fallback ---
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
          // FIX: Pass cloudApiKey if available, otherwise fall back to demo_mode in 'auto' mode
          const isDemoMode = aiMode === 'demo' || (aiMode === 'auto' && !cloudApiKey);
          const effectiveApiKey = cloudApiKey || undefined;
          const response = await fetch(`${BACKEND_URL}/api/v1/llm/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
            body: JSON.stringify({
              provider: effectiveProvider,
              model: effectiveModel,
              prompt: generatedPrompt,
              //api_key: (aiMode === 'cloud') ? (cloudApiKey || undefined) : undefined,
              //demo_mode: aiMode === 'demo' || (aiMode === 'auto' && !browserSession),
              api_key: effectiveApiKey,
              demo_mode: isDemoMode,
              prefer_browser: false,
              prefer_cloud: true,
              params: { temperature: 0.7, max_tokens: 1200 },
            }),
          });

          if (!response.ok || !response.body) {
            const errorBody = await response.text();
            details.error = formatUserFriendlyError(`API failure (${response.status}): ${errorBody}`);
            details.timeMs = Math.round(performance.now() - start);
            return { text: '', details };
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          const applyStreamingText = (textOverride?: string) => {
            const displayText = textOverride !== undefined ? textOverride : accumulated;
            const title = styleFormat === 'story'
              ? `📖 ${computedGoal} (Narrative Hook)`
              : `📋 ${computedGoal} (Bulleted Takeaways)`;
            const streamingDetails = { ...details, success: Boolean(displayText.trim()), timeMs: Math.round(performance.now() - start) };
            setVariants((current) => {
              const existing = current.filter((v) => v.id !== variantId);
              const next = [...existing, createVariant(variantId, title, displayText, streamingDetails)];
              return next.sort((a, b) => a.id.localeCompare(b.id));
            });
          };

          const consumeEvent = (eventBlock: string) => {
            const dataLines = eventBlock.split(/\r?\n/).filter((line) => line.startsWith('data:'));
            if (!dataLines.length) return;
            const data = dataLines.map((line) => line.slice(5).trimStart()).join('\n');
            if (!data || data === '[DONE]') return;

            let chunk: any = data;
            try { chunk = JSON.parse(data); } catch { return; }

            // Handle incremental tokens
            if (chunk?.type === 'token' && typeof chunk?.text === 'string') {
              accumulated += chunk.text;
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
            if (chunk?.type === 'error' && chunk?.error) details.error = formatUserFriendlyError(String(chunk.error));
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

          // Flush remaining buffer data
          if (buffer.trim()) consumeEvent(buffer);

          // Final completion pass: sanitize text if trailing sentence is incomplete
          accumulated = sanitizeIncompleteSentence(accumulated);

          details.timeMs = Math.round(performance.now() - start);
          details.success = Boolean(accumulated.trim()) && !details.error;
          if (!details.success && !details.error) details.error = 'Cloud streaming returned no usable text.';

          applyStreamingText(accumulated);
          return { text: accumulated.trim(), details };
        } catch (error: any) {
          details.timeMs = Math.round(performance.now() - start);
          details.error = formatUserFriendlyError(error?.message || String(error));

          // Ensure state sanitization on error
          accumulated = sanitizeIncompleteSentence(accumulated);

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-8">

    {/* EMBEDDED FAILSAFE RESPONSIVE STYLES */}
    <style>{`
      
      .desktop-header-actions {
        display: none !important;
      }
      .mobile-bottom-footer {
        display: flex !important;
      }

      @media (min-width: 768px) {
        .desktop-header-actions {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          gap: 8px !important;
        }
        .mobile-bottom-footer {
          display: none !important;
        }
      }
      /* Hide scroll indicator buttons on tablet/desktop (>=768px) */
      @media (min-width: 768px) {
          .tab-scroll-arrow {
            display: none !important;
          }
        }
      .workspace-header,
      .workspace-card {
        width: 100% !important;
        margin: 0 auto !important;
        box-sizing: border-box !important;
      }

      @media (min-width: 1024px) {
        .workspace-header,
        .workspace-card {
          width: 65% !important;
          max-width: 1050px !important;
          min-width: 720px !important;
        }
      }
      .auth-config-banner {
    position: fixed;
    bottom: 70px;
    left: 16px;
    right: 16px;
    z-index: 60;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
  }

  @media (min-width: 768px) {
    .auth-config-banner {
      position: relative;
      bottom: auto;
      left: auto;
      right: auto;
      width: 65%;
      margin: 0 auto 20px auto; /* Centers the 65% banner to match the header */
      box-shadow: none;
    }
    `}</style>

    {/* HEADER BAR */}
    <header className="workspace-header" style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '12px 18px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <div style={{ width: '36px', height: '36px', backgroundColor: '#0f172a', color: '#ffffff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Building2 size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            SunArc LinkedIn Draft Creator
          </h1>
          <p style={{ margin: 0, fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Voice-Driven LinkedIn Draft & Content Engine
          </p>
        </div>
      </div>

      {/* Header Actions: Side-by-side on Desktop (>=768px), Hidden on Mobile */}
      {currentView !== 'landing' && (
        <div className="desktop-header-actions">
          <button
            type="button"
            onClick={() => setCurrentView('landing')}
            style={{ backgroundColor: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <Layout size={14} />
            <span>Landing Page</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAuthConfig(!showAuthConfig)}
            style={{ backgroundColor: '#0f172a', color: '#ffffff', border: 'none', padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <Key size={14} />
            <span>API Credentials & Auth</span>
          </button>
        </div>
      )}
    </header>
      
        {/* AUTH CONFIGURATION BANNER (Mobile Floating Bottom / Desktop In-Line) */}
        {showAuthConfig && (
          <div className="auth-config-banner" style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '12px', border: '1.5px solid #2563eb', display: 'flex', flexDirection: 'column', gap: '8px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Key size={16} /> API Credentials & Auth Info for Direct Publishing
              </h3>
              <button type="button" onClick={() => setShowAuthConfig(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', color: '#64748b' }}>✕</button>
            </div>
            <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: '1.4' }}>
              Direct API publishing requires an authorized OAuth URN and Client Secret. 
              <strong> Send a direct message (DM) to info@sunarctechnologies.com to enable background publishing.</strong>
            </p>
          </div>
        )}

      {/* LANDING PAGE OR WORKSPACE VIEW */}
      {currentView === 'landing' ? (
        <div className="landing-content-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <style>{`
            .landing-content-wrapper {
              width: 100% !important;
              margin: 0 auto !important;
              box-sizing: border-box !important;
            }

            @media (min-width: 1024px) {
              .landing-content-wrapper {
                width: 65% !important;
                max-width: 1050px !important;
                min-width: 720px !important;
              }
            }

            .hero-title { font-size: 20px; }
            .hero-desc { font-size: 12px; }
            .feature-grid { grid-template-columns: repeat(3, 1fr); gap: 6px; }
            .feature-card { padding: 8px 6px; }
            .feature-icon { width: 24px; height: 24px; }
            .feature-title { font-size: 10px; }
            .feature-desc { font-size: 9px; line-height: 1.2; }

            @media (min-width: 768px) {
              .hero-title { font-size: 32px !important; }
              .hero-desc { font-size: 15px !important; }
              .feature-grid { gap: 16px !important; margin-top: 16px !important; }
              .feature-card { padding: 16px 14px !important; border-radius: 12px !important; }
              .feature-icon { width: 36px !important; height: 36px !important; border-radius: 8px !important; }
              .feature-title { font-size: 14px !important; margin-top: 4px !important; }
              .feature-desc { font-size: 12px !important; line-height: 1.4 !important; }
            }
          `}</style>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '32px 20px', border: '1px solid #e2e8f0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>
              <Sparkles size={14} /> <span>On-Device & Cloud-Powered LinkedIn Content Engine</span>
            </div>
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: 0, maxWidth: '750px', lineHeight: '1.2' }}>
              Dictate, Paste, and Draft LinkedIn Posts for Any Enterprise Scenario
            </h2>
            <p style={{ fontSize: '14px', color: '#475569', margin: 0, maxWidth: '650px', lineHeight: '1.5' }}>
              Turn voice or text notes into polished LinkedIn drafts in seconds with Gemini Nano local AI or cloud models.
            </p>
            
            {/* FEATURES GRID */}
            <div className="feature-grid" style={{ display: 'grid', width: '100%', textAlign: 'left', boxSizing: 'border-box' }}>
              <div className="feature-card" style={{ backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div className="feature-icon" style={{ backgroundColor: '#f0fdf4', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Mic size={16} />
                </div>
                <h3 className="feature-title" style={{ margin: 0, fontWeight: '700', color: '#0f172a' }}>Voice Dictation</h3>
                <p className="feature-desc" style={{ margin: 0, color: '#64748b' }}>
                  Speak notes naturally on desktop or mobile with automatic transcription and context capturing.
                </p>
              </div>

              <div className="feature-card" style={{ backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div className="feature-icon" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ShieldCheck size={16} />
                </div>
                <h3 className="feature-title" style={{ margin: 0, fontWeight: '700', color: '#0f172a' }}>On-Device AI</h3>
                <p className="feature-desc" style={{ margin: 0, color: '#64748b' }}>
                  Generate drafts completely offline in Chrome with Gemini Nano with zero API cost and total privacy.
                </p>
              </div>

              <div className="feature-card" style={{ backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div className="feature-icon" style={{ backgroundColor: '#fffbeb', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Zap size={16} />
                </div>
                <h3 className="feature-title" style={{ margin: 0, fontWeight: '700', color: '#0f172a' }}>Smart Formatting</h3>
                <p className="feature-desc" style={{ margin: 0, color: '#64748b' }}>
                  Auto-formats text with native LinkedIn unicode bolding, takeaway bullets, and visual hooks.
                </p>
              </div>
            </div>
          
            <button
              onClick={() => setCurrentView('workspace')}
              style={{ backgroundColor: '#0066c2', color: '#ffffff', border: 'none', padding: '12px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}
            >
              <span>Launch Workspace Draft Creator</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : (
        /* MAIN 4-TAB WORKSPACE BODY */
        
        <main className="max-w-5xl mx-auto p-4 md:p-6 w-full box-border">
          {/* RESPONSIVE LAYOUT & HORIZONTAL SCROLLING TABS CSS */}
<style>{`
  .workspace-wrapper {
    width: 100%;
    margin: 0 auto;
    padding: 16px;
    box-sizing: border-box;
  }

  @media (min-width: 1024px) {
    .workspace-wrapper {
      width: 65% !important;
      max-width: 1050px;
      min-width: 720px;
    }
  }

  /* Single-line horizontal scroll for Mobile, Grid for Desktop */
  .tabs-nav-container {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    white-space: nowrap;
    -webkit-overflow-scrolling: touch;
    margin-bottom: 20px;
    background-color: #f1f5f9;
    padding: 8px;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    width: 100%;
    box-sizing: border-box;
    /* Hide scrollbars across browsers */
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .tabs-nav-container::-webkit-scrollbar {
    display: none;
  }

  /* Fixed width on mobile for smooth horizontal scroll */
  .tab-item-btn {
    flex: 0 0 auto;
    width: 155px;
  }

  @media (min-width: 768px) {
    .tabs-nav-container {
      display: grid !important;
      grid-template-columns: repeat(4, 1fr) !important;
      gap: 10px;
      overflow-x: visible !important;
    }
    .tab-item-btn {
      width: 100% !important;
    }
  }
  /* Hide scroll indicator buttons on tablet/desktop (>=768px) */
  @media (min-width: 768px) {
          .tab-scroll-arrow {
            display: none !important;
          }
        }
`}</style>

<div className="workspace-wrapper">
  {/* WRAPPER WITH RELATIVE POSITIONING FOR ARROW OVERLAYS */}
  <div style={{ position: 'relative', width: '100%' }}>

    {/* LEFT ARROW INDICATOR (MOBILE ONLY) */}
    {canScrollLeft && (
      <button
        type="button"
        onClick={() => scrollTabs('left')}
        className="tab-scroll-arrow"
        aria-label="Scroll Left"
        style={{
          position: 'absolute',
          left: '4px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10,
          backgroundColor: '#ffffff',
          color: '#334155',
          border: '1px solid #cbd5e1',
          borderRadius: '50%',
          width: '28px',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          cursor: 'pointer'
        }}
      >
        <ChevronLeft size={18} />
      </button>
    )}

    {/* RIGHT ARROW INDICATOR (MOBILE ONLY) */}
    {canScrollRight && (
      <button
        type="button"
        onClick={() => scrollTabs('right')}
        className="tab-scroll-arrow"
        aria-label="Scroll Right"
        style={{
          position: 'absolute',
          right: '4px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10,
          backgroundColor: '#ffffff',
          color: '#334155',
          border: '1px solid #cbd5e1',
          borderRadius: '50%',
          width: '28px',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          cursor: 'pointer'
        }}
      >
        <ChevronRight size={18} />
      </button>
    )}
    </div>
  {/* 4-TAB SEGMENTED NAVIGATION: 1-LINE HORIZONTAL SCROLL ON MOBILE, 4-COL GRID ON PC */}
  <div className="tabs-nav-container" ref={tabsNavRef}>
    
    {/* Tab 1 */}
      <button
        type="button"
        onClick={() => setActiveTab('inputs')}
        className="tab-item-btn"
        style={{
          padding: '10px 12px',
          borderRadius: '12px',
          border: activeTab === 'inputs' ? '2px solid #2563eb' : '1px solid #cbd5e1',
          backgroundColor: activeTab === 'inputs' ? '#2563eb' : '#ffffff',
          color: activeTab === 'inputs' ? '#ffffff' : '#334155',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          textAlign: 'left',
          boxShadow: activeTab === 'inputs' ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: activeTab === 'inputs' ? '#ffffff' : '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={16} />
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{ fontSize: '12px', fontWeight: '800', lineHeight: '1.2', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>1. User Inputs</div>
          <div style={{ fontSize: '10px', opacity: activeTab === 'inputs' ? 0.9 : 0.6, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Context & Voice</div>
        </div>
      </button>

      {/* Tab 2 */}
      <button
        type="button"
        onClick={() => setActiveTab('ai')}
        className="tab-item-btn"
        style={{
          padding: '10px 12px',
          borderRadius: '12px',
          border: activeTab === 'ai' ? '2px solid #9333ea' : '1px solid #cbd5e1',
          backgroundColor: activeTab === 'ai' ? '#9333ea' : '#ffffff',
          color: activeTab === 'ai' ? '#ffffff' : '#334155',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          textAlign: 'left',
          boxShadow: activeTab === 'ai' ? '0 4px 12px rgba(147, 51, 234, 0.25)' : 'none',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: activeTab === 'ai' ? '#ffffff' : '#f3e8ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bot size={16} />
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{ fontSize: '12px', fontWeight: '800', lineHeight: '1.2', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>2. AI Controls</div>
          <div style={{ fontSize: '10px', opacity: activeTab === 'ai' ? 0.9 : 0.6, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Models & Settings</div>
        </div>
      </button>

      {/* Tab 3 */}
      <button
        type="button"
        onClick={() => setActiveTab('editor')}
        className="tab-item-btn"
        style={{
          padding: '10px 12px',
          borderRadius: '12px',
          border: activeTab === 'editor' ? '2px solid #059669' : '1px solid #cbd5e1',
          backgroundColor: activeTab === 'editor' ? '#059669' : '#ffffff',
          color: activeTab === 'editor' ? '#ffffff' : '#334155',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          textAlign: 'left',
          boxShadow: activeTab === 'editor' ? '0 4px 12px rgba(5, 150, 105, 0.25)' : 'none',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: activeTab === 'editor' ? '#ffffff' : '#d1fae5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Edit3 size={16} />
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{ fontSize: '12px', fontWeight: '800', lineHeight: '1.2', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>3. Post Editor</div>
          <div style={{ fontSize: '10px', opacity: activeTab === 'editor' ? 0.9 : 0.6, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Rich Text & Canvas</div>
        </div>
      </button>

      {/* Tab 4 */}
      <button
        type="button"
        onClick={() => setActiveTab('preview')}
        className="tab-item-btn"
        style={{
          padding: '10px 12px',
          borderRadius: '12px',
          border: activeTab === 'preview' ? '2px solid #0284c7' : '1px solid #cbd5e1',
          backgroundColor: activeTab === 'preview' ? '#0284c7' : '#ffffff',
          color: activeTab === 'preview' ? '#ffffff' : '#334155',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          textAlign: 'left',
          boxShadow: activeTab === 'preview' ? '0 4px 12px rgba(2, 132, 199, 0.25)' : 'none',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: activeTab === 'preview' ? '#ffffff' : '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Eye size={16} />
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{ fontSize: '12px', fontWeight: '800', lineHeight: '1.2', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>4. Live Preview</div>
          <div style={{ fontSize: '10px', opacity: activeTab === 'preview' ? 0.9 : 0.6, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Actions & Feed</div>
        </div>
      </button>


  </div>

</div>
          {/* TAB 1: USER INPUTS FOR FIRST DRAFT */}
          {/* TAB 1 CONTENT BODY */}
          {activeTab === 'inputs' && (
            <div className="workspace-card" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                <span style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a' }}>1. Fast Draft Generator for LinkedIn Post</span>
              </div>
      
              {/* MEETING CONTEXT SELECTOR */}
              <div style={{ width: '100%', minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                  What are you posting about?
                </label>
                <select
                  value={meetingContext}
                  onChange={(e) => setMeetingContext(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '13px' }}
                >
                  {MEETING_CONTEXTS.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
                <div style={{ marginTop: '5px', fontSize: '11px', color: '#64748b' }}>
                  {MEETING_CONTEXTS.find((item) => item.id === meetingContext)?.hint}
                </div>
              </div>

              {/* VOICE DICTATION */}
              <div style={{ width: '100%', minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Speak or type your context
                </label>
                <button
                  type="button"
                  onClick={toggleListening}
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
                  <span>{isListening ? 'Listening... Click to Stop' : '🎙️ Tap to Dictate Notes / Context'}</span>
                </button>
              </div>

              {/* TEXT PROMPT INPUT */}
              <div style={{ width: '100%', minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Add details / bullet points
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="What happened, what did you learn, who is it for, and what should people take away?"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', lineHeight: '1.5', resize: 'vertical' }}
                  rows={4}
                />
              </div>

              {/* TONE SELECTION */}
              <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Select Post Tone
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {tonesList.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setSelectedTone(tone)}
                      style={{
                        padding: '6px 12px', borderRadius: '16px', fontSize: '11px', fontWeight: '600', border: 'none', cursor: 'pointer',
                        backgroundColor: selectedTone === tone ? '#0f172a' : '#ffffff',
                        color: selectedTone === tone ? '#ffffff' : '#475569',
                        boxShadow: selectedTone === tone ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              {/* ACTION BUTTON: SWITCH TO TAB 2 (AI CONTROLS) */}
              <button
                type="button"
                onClick={() => {
                  const contextText = prompt.trim();

                  if (!contextText) {
                    setStatusMessage({ 
                      type: 'error', 
                      text: 'Please enter a topic or record voice input before generating.' 
                    });
                    return;
                  }

                  // Clear error message if validation passes
                  if (statusMessage?.type === 'error') {
                    setStatusMessage(null);
                  }

                  setActiveTab('ai');
                }}
                style={{
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '14px 20px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '6px',
                  width: '100%'
                }}
              >
                <span>Proceed to AI Controls & Generation</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* TAB 2: AI CONTROLS */}
          {/* TAB 2: AI CONTROLS */}
          {activeTab === 'ai' && (
            <div className="workspace-card" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '16px', borderRadius: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: '800', color: '#1e3a8a' }}>
                  Select AI Processing Engine
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setAiMode('auto')}
                    style={{
                      padding: '10px', borderRadius: '8px', border: `2px solid ${aiMode === 'auto' ? '#2563eb' : '#93c5fd'}`,
                      backgroundColor: aiMode === 'auto' ? '#ffffff' : '#f0f9ff', textAlign: 'left', cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#1e3a8a', display: 'block' }}>⚡ Auto (Local)</span>
                    <span style={{ fontSize: '10px', color: '#475569' }}>Chrome Gemini Nano</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAiMode('cloud')}
                    style={{
                      padding: '10px', borderRadius: '8px', border: `2px solid ${aiMode === 'cloud' ? '#2563eb' : '#93c5fd'}`,
                      backgroundColor: aiMode === 'cloud' ? '#ffffff' : '#f0f9ff', textAlign: 'left', cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#1e3a8a', display: 'block' }}>☁️ Cloud AI</span>
                    <span style={{ fontSize: '10px', color: '#475569' }}>OpenAI / Claude / Gemini</span>
                  </button>

                  <button
                    type="button"
                    disabled={!demoAvailable}
                    onClick={() => setAiMode('demo')}
                    style={{
                      padding: '10px', borderRadius: '8px', border: `2px solid ${aiMode === 'demo' ? '#2563eb' : '#93c5fd'}`,
                      backgroundColor: aiMode === 'demo' ? '#ffffff' : '#f0f9ff', textAlign: 'left', cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#1e3a8a', display: 'block' }}>🧪 Demo Server</span>
                    <span style={{ fontSize: '10px', color: '#475569' }}>Server Key Quota</span>
                  </button>
                </div>

                {/* CLOUD API SETTINGS */}
                {aiMode === 'cloud' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #93c5fd' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#1e3a8a', marginBottom: '4px' }}>Provider</label>
                        <select
                          value={cloudProvider}
                          onChange={(e) => handleProviderChange(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px' }}
                        >
                          {CLOUD_PROVIDERS.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                          <option value="custom">Custom Provider</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#1e3a8a', marginBottom: '4px' }}>Model</label>
                        <select
                          value={cloudModel}
                          onChange={(e) => setCloudModel(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px' }}
                        >
                          {CLOUD_PROVIDERS.find((p) => p.id === cloudProvider)?.models.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#1e3a8a', marginBottom: '4px' }}>API Key (In-Memory Only)</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={cloudApiKey}
                          onChange={(e) => setCloudApiKey(e.target.value)}
                          placeholder="sk-..."
                          style={{ width: '100%', padding: '8px 36px 8px 10px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px' }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          style={{ position: 'absolute', right: '8px', border: 'none', background: 'none', cursor: 'pointer' }}
                        >
                          {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* DEMO MODE PANEL */}
                {aiMode === 'demo' && (
                  <div style={{ padding: '9px 10px', borderRadius: '8px', background: '#dbeafe', color: '#1e3a8a', fontSize: '11px', lineHeight: 1.45, wordBreak: 'break-word' }}>
                    <strong>Demo Mode Active:</strong> Uses the application's server-side AI key. Availability depends on configured provider quota.
                    {demoProviders.length > 0 && <span> Server providers: {demoProviders.join(', ')}.</span>}
                  </div>
                )}

                {/* BROWSER LOCAL AI STATUS PANEL */}
                {aiMode === 'auto' && (
                  <div style={{
                    backgroundColor: browserAiStatus === 'ready' ? '#f0fdf4' : '#fffbeb',
                    border: `1px solid ${browserAiStatus === 'ready' ? '#bbf7d0' : '#fde68a'}`,
                    borderRadius: '10px',
                    padding: '10px 12px',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, flex: '1 1 auto' }}>
                        {browserAiStatus === 'ready'
                          ? <CheckCircle2 size={15} color="#15803d" style={{ flexShrink: 0 }} />
                          : <Sparkles size={15} color="#b45309" style={{ flexShrink: 0 }} />}
                        <div style={{ minWidth: 0, overflowWrap: 'break-word' }}>
                          <div style={{ fontSize: '11px', fontWeight: '800', color: '#334155' }}>
                            Local AI: {browserAiStatus === 'ready' ? 'Available' : 'Unavailable'}
                          </div>
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', wordBreak: 'break-word' }}>
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
                              cursor: 'pointer'
                            }}
                          >
                            {browserAiStatus === 'downloading' ? 'Downloading...' : 'Check / Set Up'}
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

                    {showBrowserAiHelp && (
                      <div style={{
                        marginTop: '9px',
                        paddingTop: '9px',
                        borderTop: '1px solid #fde68a',
                        fontSize: '10px',
                        lineHeight: '1.5',
                        color: '#475569'
                      }}>
                        <strong style={{ color: '#334155' }}>Local AI is used when device supports it.</strong>
                        <div style={{ marginTop: '4px' }}>
                          Uses Chrome Gemini Nano on-device. In Automatic mode, falls back to Demo Server AI if unsupported.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* GENERATE ACTION BUTTON */}
              <button
                type="button"
                onClick={generateMultiVariants}
                disabled={isGenerating}
                style={{ backgroundColor: '#0066c2', color: '#ffffff', border: 'none', padding: '14px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: isGenerating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}
              >
                {isGenerating ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                <span>{isGenerating ? 'Drafting LinkedIn Post...' : 'Generate Post Draft'}</span>
              </button>

              {/* AI GENERATION PROGRESS */}
              {generationProgress > 0 && (
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #dbeafe', borderRadius: '10px', padding: '12px', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '7px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#334155' }}>
                      {generationStage || 'Generating draft...'}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#1d4ed8' }}>
                      {generationProgress}%
                    </span>
                  </div>
                  <div style={{ height: '8px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${generationProgress}%`, backgroundColor: '#2563eb', borderRadius: '999px', transition: 'width 500ms ease-out' }} />
                  </div>
                </div>
              )}

              {/* VARIANTS DISPLAY */}
              {variants.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', width: '100%', boxSizing: 'border-box', minWidth: 0 }}>
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
                      <div key={v.id} style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', boxSizing: 'border-box', minWidth: 0, overflowWrap: 'break-word' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '12px', flexWrap: 'wrap', gap: '4px' }}>
                          <span>{v.title}</span>
                          <span style={{ backgroundColor: v.details?.success ? '#dbeafe' : '#fee2e2', color: v.details?.success ? '#1e40af' : '#991b1b', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>{v.badge}</span>
                        </div>
                        {v.details && (
                          <div className="break-word-all" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', fontSize: '11px', color: '#334155', lineHeight: '1.4', width: '100%', boxSizing: 'border-box' }}>
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
                            {v.details?.error && (
                              <div style={{ marginTop: '6px', color: '#b91c1c', fontWeight: '500' }}>
                                <strong>Error:</strong> {formatUserFriendlyError(v.details.error)}
                              </div>
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
             
          )}

          {/* TAB 3: POST CANVAS EDITOR */}
          {activeTab === 'editor' && (
            <div className="workspace-card" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* POST CANVAS EDITOR & TOOLBAR */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>Canvas Post Editor</span>
                  <span style={{ fontSize: '11px', color: (editor?.getText().length || 0) > LINKEDIN_MAX_CHARS ? '#dc2626' : '#64748b', fontWeight: (editor?.getText().length || 0) > LINKEDIN_MAX_CHARS ? '700' : 'normal' }}>
                    {editor?.getText().length || 0} / {LINKEDIN_MAX_CHARS}
                  </span>
                </div>

                {/* TIPTAP TOOLBAR */}
                {editor && (
                  <div className="toolbar-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', backgroundColor: '#f8fafc', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          border: editor.isActive('bold') ? '1px solid #0066c2' : '1px solid transparent',
                          backgroundColor: editor.isActive('bold') ? '#eff6ff' : 'transparent',
                          color: editor.isActive('bold') ? '#0066c2' : '#475569',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="Bold"
                      >
                        <Bold size={15} />
                      </button>

                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          border: editor.isActive('italic') ? '1px solid #0066c2' : '1px solid transparent',
                          backgroundColor: editor.isActive('italic') ? '#eff6ff' : 'transparent',
                          color: editor.isActive('italic') ? '#0066c2' : '#475569',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="Italic"
                      >
                        <Italic size={15} />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const previousUrl = editor.getAttributes('link').href;
                          const url = window.prompt('URL', previousUrl);
                          if (url === null) return;
                          if (url === '') {
                            editor.chain().focus().extendMarkRange('link').unsetLink().run();
                            return;
                          }
                          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
                        }}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          border: editor.isActive('link') ? '1px solid #0066c2' : '1px solid transparent',
                          backgroundColor: editor.isActive('link') ? '#eff6ff' : 'transparent',
                          color: editor.isActive('link') ? '#0066c2' : '#475569',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="Link"
                      >
                        <LinkIcon size={15} />
                      </button>

                      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#eff6ff',
                          color: '#0066c2',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <ImageIcon size={14} /> Add Image
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                      {emojiAndSymbolsList.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => editor.chain().focus().insertContent(item).run()}
                          style={{ border: 'none', background: 'none', fontSize: '13px', cursor: 'pointer', padding: '2px 4px' }}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* TIPTAP EDITOR CONTAINER */}
                <div className="rich-editor-box" style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', minHeight: '160px', backgroundColor: '#ffffff' }}>
                  <EditorContent editor={editor} />
                </div>

                {/* DRAFT ACTIONS */}
                <div className="draft-actions" style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleManualPost}
                    style={{ flex: 1, backgroundColor: '#0066c2', color: '#ffffff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <ExternalLink size={16} />
                    <span>Copy Draft & Open LinkedIn</span>
                  </button>

                  <button
                    type="button"
                    disabled={true}
                    style={{ flex: 1, backgroundColor: '#94a3b8', color: '#ffffff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'not-allowed', opacity: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Lock size={15} />
                    <span>Publish Direct API (DM)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LIVE POST PREVIEW */}
          {activeTab === 'preview' && (
            <div className="workspace-card" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* RIGHT COLUMN: PREVIEW CONTAINER */}
              <div className="workspace-column workspace-preview" style={{ width: '100%' }}>
                <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', overflow: 'hidden', width: '100%' }}>
                  
                  {/* HEADER BAR */}
                  <div style={{ backgroundColor: '#0f172a', color: '#ffffff', padding: '10px 16px', fontSize: '12px', fontWeight: '700', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Eye size={14} style={{ color: '#38bdf8' }} /> Live Post Feed Canvas
                    </span>
                    <span style={{ backgroundColor: '#059669', color: '#ffffff', padding: '2px 8px', borderRadius: '10px', fontSize: '10px' }}>Real-time Preview</span>
                  </div>

                  {/* POST BODY */}
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    
                    {/* AUTHOR PROFILE ROW */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '42px', height: '42px', backgroundColor: '#0066c2', borderRadius: '50%', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                        ST
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Sunarc Technologies <CheckCircle2 size={13} style={{ color: '#0066c2' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Enterprise Cloud Solutions • Promoted</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Just now • <Globe size={10} />
                        </div>
                      </div>
                    </div>

                    {/* DRAFT CONTENT DISPLAY */}
                    <div style={{ fontSize: '13px', color: '#1e293b', lineHeight: '1.6', minHeight: '120px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                      <div dangerouslySetInnerHTML={{ __html: htmlContent || '<p style="color: #94a3b8; italic;">No content drafted yet. Use Tab 1 or 2 to generate a post draft.</p>' }} />
                    </div>

                    {/* OPTIONAL ATTACHED IMAGE */}
                    {typeof attachedImageUrl !== 'undefined' && attachedImageUrl && (
                      <div style={{ marginTop: '8px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                        <img src={attachedImageUrl} alt="Attached to post" style={{ width: '100%', maxHeight: '280px', objectFit: 'cover' }} />
                      </div>
                    )}

                    {/* ENGAGEMENT METRICS */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ backgroundColor: '#0066c2', color: '#ffffff', borderRadius: '50%', padding: '2px', fontSize: '8px' }}>👍</span>
                        <span style={{ fontWeight: '600' }}>1,420</span>
                      </div>
                      <div>48 comments • 12 reposts</div>
                    </div>

                    {/* MOCK ENGAGEMENT ACTION FOOTER */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '10px', color: '#64748b', fontSize: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><ThumbsUp size={14} /> <span>Like</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><MessageSquare size={14} /> <span>Comment</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><Repeat2 size={14} /> <span>Repost</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><SendHorizontal size={14} /> <span>Send</span></div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          )} 
        </main>
      )}

      {/* Mobile Bottom Footer: Visible on Mobile (<768px), Hidden on Desktop */}
        {currentView !== 'landing' && (
          <div className="mobile-bottom-footer" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0', padding: '12px', justifyContent: 'space-around', alignItems: 'center', zIndex: 50, boxShadow: '0 -4px 12px rgba(0,0,0,0.05)' }}>
            <button
              type="button"
              onClick={() => setCurrentView('landing')}
              style={{ flex: 1, marginRight: '6px', backgroundColor: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Layout size={14} />
              <span>Landing Page</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAuthConfig(!showAuthConfig)}
              style={{ flex: 1, marginLeft: '6px', backgroundColor: '#0f172a', color: '#ffffff', border: 'none', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Key size={14} />
              <span>API Credentials & Auth</span>
            </button>
          </div>
        )}
      
      {/* STICKY BOTTOM STATUS MESSAGE BAR */}
      {statusMessage && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          width: 'calc(100% - 32px)',
          maxWidth: '560px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            padding: '12px 16px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            backgroundColor: statusMessage.type === 'error' ? '#1e1b4b' : statusMessage.type === 'success' ? '#064e3b' : '#0f172a',
            color: '#ffffff',
            border: `1px solid ${statusMessage.type === 'error' ? '#ef4444' : statusMessage.type === 'success' ? '#10b981' : '#38bdf8'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              {statusMessage.type === 'error' ? (
                <AlertCircle size={18} style={{ color: '#f87171', flexShrink: 0 }} />
              ) : statusMessage.type === 'success' ? (
                <CheckCircle2 size={18} style={{ color: '#34d399', flexShrink: 0 }} />
              ) : (
                <Sparkles size={18} style={{ color: '#38bdf8', flexShrink: 0 }} />
              )}
              <span style={{ lineHeight: '1.4', wordBreak: 'break-word', minWidth: 0 }}>
                {statusMessage.text}
              </span>
            </div>

            <button
              onClick={() => setStatusMessage(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
              title="Close status"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkedInWorkspace;