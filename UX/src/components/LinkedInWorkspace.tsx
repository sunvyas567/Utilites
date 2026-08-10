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

export async function getBrowserAiSession(): Promise<any | null> {
  try {
    const globalLM = typeof LanguageModel !== 'undefined'
      ? LanguageModel
      : (typeof window !== 'undefined' ? (window as any).LanguageModel : undefined);

    if (globalLM) {
      const availability = typeof globalLM.availability === 'function' ? await globalLM.availability() : 'readily';
      if (availability !== 'no' && availability !== 'unavailable') return await globalLM.create();
    }

    const aiObj = typeof window !== 'undefined' ? ((window as any).ai || (navigator as any).ai) : null;
    if (aiObj?.languageModel) {
      const caps = typeof aiObj.languageModel.capabilities === 'function' ? await aiObj.languageModel.capabilities() : null;
      if (!caps || caps.available === 'readily' || caps.available === 'after-download') {
        return await aiObj.languageModel.create();
      }
    }
  } catch (err) {
    console.warn("Failed to initialize Chrome AI:", err);
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
  cta: string,
  styleFormat: 'story' | 'list'
): string => {
  const goalPrompt = isGeneralGoal(goal) ? 'update' : `${goal} post`;
  const tonePrompt = tone === 'General / Custom' ? 'authentic' : tone;

  const formatInstructions = styleFormat === 'story'
    ? 'Write in clear narrative paragraph form with strong hook sentences. Do not use bullet points. Make it polished, complete, and easy to read. Include a strong opening, a meaningful middle, and a clear call to action.'
    : 'Format the post as a polished list-driven LinkedIn update with one opening paragraph, then 3 short takeaway bullets starting with "🔹 ", and a closing line with the CTA. Make it feel complete and professional.';

  return `Write one high-converting LinkedIn ${goalPrompt}.
Tone: ${tonePrompt}.
Call to Action: ${cta}.
Context / Key Points: ${topicText || 'General industry insight'}.
Formatting Rule: ${formatInstructions}
Keep the total length rich and complete, around 250-450 words. Return plain text only, without commentary or labels.`;
};

export const generateWithBrowserAi = async (
  topicText: string,
  goal: string,
  tone: string,
  cta: string,
  styleFormat: 'story' | 'list'
): Promise<BrowserAiResult> => {
  const prompt = buildGenerationPrompt(topicText, goal, tone, cta, styleFormat);
  const start = performance.now();

  const details: VariantDetails = {
    provider: 'browser',
    success: false,
    params: { temperature: 0.7, max_tokens: 4096 },
    timeMs: 0,
  };

  try {
    const session = await getBrowserAiSession();
    if (!session) {
      details.error = 'Browser AI session is unavailable.';
      return { text: '', details };
    }

    let result: any = null;
    if (typeof session.prompt === 'function') {
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
      : '';

    details.model = result?.model || result?.modelId || result?.provider || 'browser';
    details.usage = result?.usage || result?.usageStats || result?.tokenUsage || undefined;
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
  const [selectedGoal, setSelectedGoal] = useState<string>('General / Context');
  const [selectedTone, setSelectedTone] = useState<string>('Conversational');
  const [selectedCta, setSelectedCta] = useState<string>('Visit Link');
  
  // Cloud Provider & API Key States
  const [cloudProvider, setCloudProvider] = useState<string>('gemini');
  const [cloudModel, setCloudModel] = useState<string>('gemini-2.5-flash');
  const [cloudApiKey, setCloudApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [browserAiStatus, setBrowserAiStatus] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [useBrowserAi, setUseBrowserAi] = useState<boolean>(true);
  const [generationMode, setGenerationMode] = useState<'idle' | 'browser' | 'cloud' | 'template'>('idle');

  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const basePromptRef = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [editorHtml, setEditorHtml] = useState('');
  const [plainText, setPlainText] = useState('');
  const [attachedImageUrl, setAttachedImageUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const objectivesList = ['General / Context','Product Launch', 'Thought Leadership', 'Technical Architecture', 'Hiring'];
  const tonesList = ['General / Custom','Conversational', 'Authoritative', 'Technical' ];
  const emojiAndSymbolsList = ['🔹', '▸', '▪', '✅', '⚡', '🚀', '💡', '📈', '🔥', '💬'];

  // Handle Provider Change
  const handleProviderChange = (providerId: string) => {
    setCloudProvider(providerId);
    const matched = CLOUD_PROVIDERS.find((p) => p.id === providerId);
    if (matched) {
      setCloudModel(matched.defaultModel);
    }
  };

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

  useEffect(() => {
    const checkAi = async () => {
      const session = await getBrowserAiSession();
      setBrowserAiStatus(session ? 'ready' : 'unavailable');
    };
    checkAi();
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

  const generateMultiVariants = async () => {
    setIsGenerating(true);
    const contextText = prompt || (!isGeneralGoal(selectedGoal) ? selectedGoal : 'General Corporate Update');
    const computedGoal = isGeneralGoal(selectedGoal) ? detectGoalFromPrompt(contextText) : selectedGoal;
    const computedTone = selectedTone === 'Conversational' ? detectToneFromPrompt(contextText) : selectedTone;

    if (isGeneralGoal(selectedGoal) && computedGoal !== selectedGoal) setSelectedGoal(computedGoal);
    if (selectedTone === 'Conversational' && computedTone !== selectedTone) setSelectedTone(computedTone);

    try {
      const browserSession = useBrowserAi ? await getBrowserAiSession() : null;
      let storyBrowser: BrowserAiResult | null = null;
      let listBrowser: BrowserAiResult | null = null;
      let storyCloud: CloudAiResult | null = null;
      let listCloud: CloudAiResult | null = null;
      let finalMode: 'browser' | 'cloud' | 'template' = 'template';

      if (useBrowserAi && browserSession) {
        storyBrowser = await generateWithBrowserAi(contextText, computedGoal, computedTone, selectedCta, 'story');
        listBrowser = await generateWithBrowserAi(contextText, computedGoal, computedTone, selectedCta, 'list');
      }

      // Cloud Variant Call with user provider & API key
      const attemptCloudVariant = async (styleFormat: 'story' | 'list'): Promise<CloudAiResult> => {
        const generatedPrompt = buildGenerationPrompt(contextText, computedGoal, computedTone, selectedCta, styleFormat);
        const start = performance.now();

        const response = await fetch(`${BACKEND_URL}/api/v1/llm/invoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: cloudProvider,
            model: cloudModel,
            prompt: generatedPrompt,
            api_key: cloudApiKey || undefined,
            prefer_browser: false,
            prefer_cloud: true,
            params: { temperature: 0.7, max_tokens: 4096 },
          }),
        });

        const end = performance.now();
        const details: VariantDetails = {
          provider: cloudProvider,
          model: cloudModel,
          success: false,
          params: { temperature: 0.7, max_tokens: 4096 },
          timeMs: Math.round(end - start),
        };

        if (!response.ok) {
          const errorBody = await response.text();
          details.error = `Cloud API failure (${response.status}): ${errorBody}`;
          return { text: '', details };
        }

        const serverData = await response.json();
        details.model = serverData.model || details.model;
        details.usage = serverData.usage || undefined;
        details.rateLimit = serverData.rate_limit || serverData.rateLimit || undefined;
        details.success = Boolean(serverData.success !== false && serverData.text?.trim());
        details.error = !details.success ? serverData.error || 'Cloud generation returned no usable text.' : undefined;

        return { text: (serverData.text || '').trim(), details };
      };

      if (!storyBrowser?.details.success) storyCloud = await attemptCloudVariant('story');
      if (!listBrowser?.details.success) listCloud = await attemptCloudVariant('list');

      const storyFinal = storyBrowser?.details.success ? storyBrowser : storyCloud;
      const listFinal = listBrowser?.details.success ? listBrowser : listCloud;

      if (storyFinal?.details.success || listFinal?.details.success) {
        finalMode = storyFinal?.details.provider === 'browser' || listFinal?.details.provider === 'browser' ? 'browser' : 'cloud';
      }

      const activeProviderObj = CLOUD_PROVIDERS.find((p) => p.id === cloudProvider);
      const providerLabel = finalMode === 'browser' 
        ? `${getBrowserAiModelName()}` 
        : finalMode === 'cloud' 
        ? `Cloud AI (${activeProviderObj?.name || cloudProvider})` 
        : 'Template';

      const fallbackGoal = !isGeneralGoal(computedGoal) ? computedGoal : 'Key Update';

      setVariants([
        {
          id: 'v1',
          title: `📖 ${fallbackGoal} (Narrative Hook)`,
          badge: storyFinal?.details.success ? providerLabel : 'Error',
          contentHtml: storyFinal?.details.success
            ? formatToHtml(storyFinal.text, false)
            : `<div style="color:#991b1b;"><p><strong>AI Response Error</strong></p><p>${storyFinal?.details.error || 'No generated text available.'}</p></div>`,
          details: storyFinal?.details ?? storyBrowser?.details ?? storyCloud?.details,
        },
        {
          id: 'v2',
          title: `📋 ${fallbackGoal} (Bulleted Takeaways)`,
          badge: listFinal?.details.success ? providerLabel : 'Error',
          contentHtml: listFinal?.details.success
            ? formatToHtml(listFinal.text, true)
            : `<div style="color:#991b1b;"><p><strong>AI Response Error</strong></p><p>${listFinal?.details.error || 'No generated text available.'}</p></div>`,
          details: listFinal?.details ?? listBrowser?.details ?? listCloud?.details,
        }
      ]);

      setBrowserAiStatus(browserSession ? 'ready' : 'unavailable');
      setGenerationMode(finalMode);
      setStatusMessage({
        type: 'info',
        text: finalMode === 'template'
          ? 'Generated custom draft variants from template.'
          : `Generated 2 variants via ${providerLabel}.`
      });
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: `Variant generation failed: ${error?.message || String(error)}` });
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
    <div className="linkedin-workspace" style={{ backgroundColor: '#f1f5f9', minHeight: '100vh', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#0f172a' }}>
      
      <style>{`
        .ProseMirror { outline: none; min-height: 160px; caret-color: #0066c2; }
        .ProseMirror-focused { border-color: #0066c2 !important; box-shadow: 0 0 0 3px rgba(0, 102, 194, 0.15); }
        .ProseMirror ::selection { background-color: #bfdbfe !important; color: #1e3a8a !important; }

        .linkedin-workspace, .linkedin-workspace * { box-sizing: border-box; }
        .topic-textarea, .editor-surface, .preview-body { overflow-wrap: anywhere; word-break: break-word; }
        .preview-body img { max-width: 100% !important; height: auto !important; }
        .preview-card { width: 100%; }
        .cloud-config, .options-panel, .workspace-card, .preview-card { min-width: 0; }
        .cloud-grid > div, .cloud-grid select, .cloud-grid input { min-width: 0; max-width: 100%; }
        .editor-toolbar > div { min-width: 0; }
        .editor-toolbar button { flex-shrink: 0; }

        @media (max-width: 768px) {
          .linkedin-workspace {
            padding: 10px !important;
          }

          .workspace-container {
            width: 100% !important;
            gap: 12px !important;
          }

          .workspace-header {
            padding: 12px !important;
            border-radius: 12px !important;
            align-items: stretch !important;
          }

          .workspace-header > div:first-child {
            min-width: 0 !important;
            flex: 1 1 100% !important;
          }

          .workspace-header h1 {
            font-size: 16px !important;
            line-height: 1.25 !important;
          }

          .workspace-header p {
            font-size: 10px !important;
            line-height: 1.35 !important;
          }

          .auth-button {
            width: 100% !important;
            justify-content: center !important;
            padding: 10px 12px !important;
          }

          .status-message {
            align-items: flex-start !important;
            gap: 8px !important;
          }

          .workspace-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 12px !important;
          }

          .workspace-left {
            gap: 12px !important;
            min-width: 0 !important;
          }

          .workspace-card {
            padding: 14px !important;
            border-radius: 12px !important;
          }

          .section-header {
            align-items: flex-start !important;
            gap: 8px !important;
          }

          .section-header > span:first-child {
            min-width: 0 !important;
            line-height: 1.35 !important;
          }

          .topic-textarea {
            min-height: 88px;
          }

          .options-panel, .cloud-config {
            padding: 11px !important;
          }

          .cloud-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .cloud-config > div:first-child {
            align-items: flex-start !important;
            gap: 8px !important;
          }

          .cloud-config > div:first-child > label {
            min-width: 0 !important;
            line-height: 1.35 !important;
          }

          .cloud-config > div:first-child > span {
            white-space: normal !important;
            text-align: right !important;
          }

          .generate-button {
            width: 100% !important;
            min-height: 44px !important;
          }

          .variants-container > div {
            min-width: 0 !important;
          }

          .variants-container > div > div:first-child {
            align-items: flex-start !important;
            gap: 8px !important;
            flex-wrap: wrap !important;
          }

          .variants-container > div > div:first-child > span:first-child {
            min-width: 0 !important;
            flex: 1 1 180px !important;
            overflow-wrap: anywhere !important;
          }

          .editor-card {
            padding: 14px !important;
          }

          .editor-toolbar {
            align-items: stretch !important;
            flex-direction: column !important;
          }

          .editor-toolbar > div:first-child {
            width: 100% !important;
            flex-wrap: wrap !important;
          }

          .editor-toolbar > div:last-child {
            width: 100% !important;
            justify-content: flex-start !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
          }

          .editor-surface {
            padding: 10px !important;
            min-height: 180px !important;
          }

          .ProseMirror {
            min-height: 160px !important;
            max-width: 100% !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }

          .attachment-row {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 8px !important;
          }

          .attachment-row > div {
            width: 100% !important;
            justify-content: stretch !important;
          }

          .attachment-row button,
          .attachment-row a {
            flex: 1 1 0 !important;
            justify-content: center !important;
          }

          .post-actions {
            flex-direction: column !important;
            gap: 8px !important;
          }

          .post-actions button {
            width: 100% !important;
            min-height: 46px !important;
            flex: none !important;
          }

          .preview-column {
            position: static !important;
            width: 100% !important;
          }

          .preview-header {
            padding: 10px 12px !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
          }

          .preview-header > span:last-child {
            white-space: normal !important;
          }

          .preview-content {
            padding: 12px !important;
          }

          .preview-profile {
            align-items: flex-start !important;
          }

          .preview-profile > div:last-child {
            min-width: 0 !important;
          }

          .preview-profile > div:last-child > div {
            overflow-wrap: anywhere !important;
          }

          .preview-footer {
            flex-wrap: wrap !important;
            gap: 6px !important;
          }
        }

        @media (max-width: 420px) {
          .linkedin-workspace {
            padding: 6px !important;
          }

          .workspace-card {
            padding: 11px !important;
          }

          .workspace-header {
            padding: 10px !important;
          }

          .workspace-header > div:first-child > div:first-child {
            width: 36px !important;
            height: 36px !important;
            font-size: 18px !important;
            flex: 0 0 36px !important;
          }

          .workspace-header h1 {
            font-size: 14px !important;
          }

          .workspace-header p {
            font-size: 9px !important;
          }

          .section-header {
            flex-direction: column !important;
          }

          .section-header > div {
            width: 100% !important;
            justify-content: flex-start !important;
          }

          .editor-toolbar {
            padding: 7px !important;
          }

          .preview-header {
            font-size: 11px !important;
          }

          .preview-body {
            font-size: 12px !important;
          }
        }
      `}</style>

      <div className="workspace-container" style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* HEADER BAR */}
        <header className="workspace-header" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '16px 24px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div className="preview-profile" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '42px', height: '42px', backgroundColor: '#0066c2', color: '#ffffff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '22px' }}>
              in
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>LinkedIn Posts Draft Creator</h1>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Voice-Driven LinkedIn Draft & Content Engine</p>
            </div>
          </div>

          <button className="auth-button"
            onClick={() => setShowAuthConfig(!showAuthConfig)}
            style={{ backgroundColor: '#0f172a', color: '#ffffff', border: 'none', padding: '9px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Key size={14} />
            <span>API Credentials & Auth Info</span>
          </button>
        </header>

        {showAuthConfig && (
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #3b82f6', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700' }}>Direct API Publishing Credentials</h3>
              <button onClick={() => setShowAuthConfig(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            </div>
            <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: '1.5' }}>
              Direct API publishing requires an authorized OAuth URN and Client Secret. 
              <strong> Send a direct message (DM) to info@sunarctechnologies.com to enable direct background publishing.</strong>
            </p>
          </div>
        )}

        {statusMessage && (
          <div className="status-message" style={{ 
            padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: '500', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: statusMessage.type === 'error' ? '#fef2f2' : statusMessage.type === 'success' ? '#ecfdf5' : '#eff6ff',
            color: statusMessage.type === 'error' ? '#991b1b' : statusMessage.type === 'success' ? '#065f46' : '#1e40af',
            border: `1px solid ${statusMessage.type === 'error' ? '#fecaca' : statusMessage.type === 'success' ? '#a7f3d0' : '#bfdbfe'}`
          }}>
            <span>{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
          </div>
        )}

        <div className="workspace-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(340px, 1fr)', gap: '24px', alignItems: 'start' }}>
          
          <div className="workspace-left" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div className="workspace-card generator-card" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                <span style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>1. Fast Draft Generator for LinkedIn Post</span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ backgroundColor: browserAiStatus === 'ready' ? '#dcfce7' : '#eff6ff', color: browserAiStatus === 'ready' ? '#166534' : '#1d4ed8', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700' }}>
                    {browserAiStatus === 'ready' ? `${getBrowserAiModelName()} Ready` : 'Template Engine Active'}
                  </span>
                  <span style={{ backgroundColor: generationMode === 'browser' ? '#fef3c7' : generationMode === 'cloud' ? '#e0f2fe' : '#f3f4f6', color: generationMode === 'browser' ? '#92400e' : generationMode === 'cloud' ? '#075985' : '#374151', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700' }}>
                    {generationMode === 'browser' ? 'Final: Browser AI' : generationMode === 'cloud' ? 'Final: Cloud' : generationMode === 'template' ? 'Final: Template' : 'Final: Pending'}
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Speak about topic you want to Post
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
                  Add Additional context or Type your topic details directly
                </label>
                <textarea className="topic-textarea"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Speak or type notes here..."
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', lineHeight: '1.5' }}
                  rows={3}
                />
              </div>

              {/* PREDEFINED PILLS */}
              <div className="options-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Select Preferred Objective
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {objectivesList.map((goal) => (
                      <button
                        key={goal}
                        onClick={() => setSelectedGoal(goal)}
                        style={{
                          padding: '5px 12px', borderRadius: '16px', fontSize: '11px', fontWeight: '600', border: 'none', cursor: 'pointer',
                          backgroundColor: selectedGoal === goal ? '#0066c2' : '#ffffff',
                          color: selectedGoal === goal ? '#ffffff' : '#334155',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                      >
                        {goal}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Select Tone
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {tonesList.map((tone) => (
                      <button
                        key={tone}
                        onClick={() => setSelectedTone(tone)}
                        style={{
                          padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', border: 'none', cursor: 'pointer',
                          backgroundColor: selectedTone === tone ? '#0f172a' : '#ffffff',
                          color: selectedTone === tone ? '#ffffff' : '#475569'
                        }}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Call To Action (CTA) Style
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {['Visit Link', 'Drop Comment', 'DM Connect'].map((cta) => (
                      <button
                        key={cta}
                        onClick={() => setSelectedCta(cta)}
                        style={{
                          padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', border: 'none', cursor: 'pointer',
                          backgroundColor: selectedCta === cta ? '#4f46e5' : '#ffffff',
                          color: selectedCta === cta ? '#ffffff' : '#475569'
                        }}
                      >
                        {cta}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* CLOUD AI PROVIDER & KEYS CONFIGURATION BOX */}
              <div className="cloud-config" style={{ display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '14px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: '700', color: '#1e40af' }}>
                    <input
                      type="checkbox"
                      checked={useBrowserAi}
                      onChange={() => setUseBrowserAi((value) => !value)}
                    />
                    <span>Prefer Browser Local AI (Gemini Nano)</span>
                  </label>
                  <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: '600' }}>
                    {!useBrowserAi ? 'Cloud AI Enforced' : 'Cloud Fallback Enabled'}
                  </span>
                </div>

                {/* SHOW CLOUD AI CONTROLS WHEN BROWSER AI IS UNCHECKED OR AS FALLBACK */}
                <div className="cloud-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#1e3a8a', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Cloud AI Provider
                    </label>
                    <select
                      value={cloudProvider}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px', backgroundColor: '#ffffff' }}
                    >
                      {CLOUD_PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#1e3a8a', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Target Model
                    </label>
                    <select
                      value={cloudModel}
                      onChange={(e) => setCloudModel(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px', backgroundColor: '#ffffff' }}
                    >
                      {CLOUD_PROVIDERS.find((p) => p.id === cloudProvider)?.models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* MASKED API KEY INPUT */}
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
                    If left blank, backend environment variables will be used.
                  </span>
                </div>
              </div>

              <button className="generate-button"
                onClick={generateMultiVariants} 
                disabled={isGenerating}
                style={{ backgroundColor: '#0066c2', color: '#ffffff', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Sparkles size={16} />
                <span>{isGenerating ? 'Generating Variants...' : 'Generate Content Variants'}</span>
              </button>

              {/* VARIANTS DISPLAY */}
              {variants.length > 0 && (
                <div className="variants-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b' }}>GENERATED VARIANTS:</span>
                  {variants.map((v) => (
                    <div key={v.id} style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '12px' }}>
                        <span>{v.title}</span>
                        <span style={{ backgroundColor: v.details?.success ? '#dbeafe' : '#fee2e2', color: v.details?.success ? '#1e40af' : '#991b1b', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>{v.badge}</span>
                      </div>
                      {v.details && (
                        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', fontSize: '11px', color: '#334155', lineHeight: '1.4' }}>
                          <div style={{ marginBottom: '4px' }}><strong>Provider / Model:</strong> {v.details.provider} / {v.details.model || 'default'}</div>
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
            <div className="workspace-card editor-card" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                <span style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>2. Post Canvas Editor</span>
                <span style={{ fontSize: '11px', color: plainText.length > LINKEDIN_MAX_CHARS ? '#dc2626' : '#64748b', fontWeight: plainText.length > LINKEDIN_MAX_CHARS ? '700' : 'normal' }}>
                  Characters: <strong>{plainText.length}</strong> / {LINKEDIN_MAX_CHARS} max
                </span>
              </div>

              {editor && (
                <div className="editor-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', backgroundColor: '#f8fafc', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#ffffff', padding: '3px 8px', borderRadius: '20px', border: '1px solid #cbd5e1', flexWrap: 'wrap' }}>
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

              <div className="editor-surface" style={{ minHeight: '160px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', fontSize: '13px', lineHeight: '1.6', position: 'relative' }}>
                <EditorContent editor={editor} />
              </div>

              {attachedImageUrl && (
                <div className="attachment-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
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

              <div className="post-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleManualPost}
                  style={{ flex: 1, backgroundColor: '#0066c2', color: '#ffffff', border: 'none', padding: '14px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <ExternalLink size={16} />
                  <span>Copy Text & Open LinkedIn App</span>
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
          <div className="preview-column" style={{ position: 'sticky', top: '24px' }}>
            <div className="preview-card" style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div className="preview-header" style={{ backgroundColor: '#0f172a', color: '#ffffff', padding: '10px 16px', fontSize: '12px', fontWeight: '700', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Eye size={14} style={{ color: '#38bdf8' }} /> Live Post Canvas
                </span>
                <span style={{ backgroundColor: '#059669', color: '#ffffff', padding: '2px 8px', borderRadius: '10px', fontSize: '10px' }}>Real-time Preview</span>
              </div>

              <div className="preview-content" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

                <div className="preview-body" style={{ fontSize: '13px', color: '#1e293b', lineHeight: '1.6', minHeight: '120px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                  {editorHtml && editorHtml !== '<p></p>' ? (
                    <div dangerouslySetInnerHTML={{ __html: editorHtml }} />
                  ) : (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Your generated content will dynamically render here...</span>
                  )}
                </div>

                <div className="preview-footer" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
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