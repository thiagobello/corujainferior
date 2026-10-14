// pdfmake 0.3 (build para navegador). Tipagem mínima do que o app usa.
declare module 'pdfmake/build/pdfmake' {
  const pdfMake: {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    createPdf(doc: unknown): { getBlob(): Promise<Blob> };
  };
  export default pdfMake;
}
declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>;
  export default vfs;
}
