'use client';
import { memo, Children, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import CopyButton from './CopyButton';
import { nodeText, normalizeMath } from '@/lib/utils';

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [
  [rehypeKatex, { strict: 'ignore', throwOnError: false }],
  [rehypeHighlight, { detect: false, ignoreMissing: true }],
];

function Pre({ children }) {
  const el = Children.toArray(children).find(isValidElement);
  const className = el?.props?.className || '';
  const lang = /language-([\w+#.-]+)/.exec(className)?.[1] || 'text';
  const raw = nodeText(el?.props?.children).replace(/\n$/, '');
  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span>{lang}</span>
        <CopyButton text={raw} label="Copy code" showLabel />
      </div>
      <pre>
        <code className={className}>{el?.props?.children}</code>
      </pre>
    </div>
  );
}

const components = {
  pre: Pre,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  ),
};

/** Markdown + GFM + LaTeX (KaTeX) + syntax-highlighted code with copy buttons. */
function Markdown({ text }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {normalizeMath(text || '')}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
