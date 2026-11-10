const path = require('path');

const TEXT_EXT = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go',
  '.rs', '.c', '.cpp', '.h', '.cs', '.rb', '.php', '.html', '.css', '.yml', '.yaml', '.xml', '.sql', '.sh',
  '.log', '.ini', '.toml', '.rst',
]);

async function extractText({ buffer, originalname, mimetype = '' }) {
  const ext = path.extname(originalname).toLowerCase();

  if (ext === '.pdf' || mimetype === 'application/pdf') {
    // Import the lib file directly: pdf-parse's index.js runs a debug routine on require.
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const result = await pdfParse(buffer);
    return result.text || '';
  }
  if (TEXT_EXT.has(ext) || mimetype.startsWith('text/')) {
    return buffer.toString('utf8');
  }
  const err = new Error(`Unsupported file type "${ext || mimetype}". Upload text, Markdown, or PDF files.`);
  err.status = 415;
  throw err;
}

module.exports = { extractText };
