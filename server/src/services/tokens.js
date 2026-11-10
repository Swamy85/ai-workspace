/**
 * Lightweight token estimator (~4 chars/token). Swap for tiktoken or a
 * provider-specific counter if you need exact budgets.
 */
const estimateTokens = (text = '') => Math.ceil(String(text).length / 4);
const messageTokens = (m) => estimateTokens(m.content) + 4;

module.exports = { estimateTokens, messageTokens };
