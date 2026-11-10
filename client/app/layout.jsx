import './globals.css';
import 'katex/dist/katex.min.css';

export const metadata = {
  applicationName: 'AI Workspace',
  title: {
    default: 'AI Workspace — a focused AI chat with live information',
    template: '%s · AI Workspace',
  },
  description:
    'A fast, focused AI workspace with streaming answers, live up-to-date information, document analysis, long-term memory and a prompt library.',
  keywords: ['AI chat', 'AI assistant', 'live web search', 'document analysis', 'workspace'],
  authors: [{ name: 'AI Workspace' }],
  openGraph: {
    title: 'AI Workspace — a focused AI chat with live information',
    description:
      'Streaming answers from a real model, current information, documents and long-term memory in one clean workspace.',
    type: 'website',
    siteName: 'AI Workspace',
  },
  twitter: {
    card: 'summary',
    title: 'AI Workspace — a focused AI chat with live information',
    description: 'Streaming answers, current information, documents and memory in one clean workspace.',
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#121214' },
  ],
};

// Runs before hydration so the saved/system theme is applied without a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('aiw:theme');var d=t?JSON.parse(t)==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
