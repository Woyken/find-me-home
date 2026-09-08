// Playwright rejects Android hosts before Chromium is launched. Termux uses its
// system Chromium binary, so expose the supported Linux host identifier instead.
if (process.platform === 'android') {
  Object.defineProperty(process, 'platform', { value: 'linux' })
}
