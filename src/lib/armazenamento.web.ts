// No navegador usa o localStorage nativo.
export const armazenamento = typeof window !== 'undefined' ? window.localStorage : undefined;
