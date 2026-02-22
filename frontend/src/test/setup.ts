import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })
});

if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:mock-url';
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {};
}
