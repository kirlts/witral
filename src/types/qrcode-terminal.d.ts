// Type declarations for qrcode-terminal
// This file provides types for the default export used in the codebase
// The package exports a default object with a generate method
declare module 'qrcode-terminal' {
  interface QRCodeTerminal {
    generate(
      qr: string,
      options?: { small?: boolean }
    ): void;
  }
  const qrcode: QRCodeTerminal;
  export default qrcode;
}

