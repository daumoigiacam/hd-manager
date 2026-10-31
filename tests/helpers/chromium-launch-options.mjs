// CI uses the Chromium installed by Playwright; local Windows can use Chrome.
// Explicit overrides remain available for managed browser installations.
export function chromiumLaunchOptions() {
  const executablePath=process.env.CHROME_EXECUTABLE||process.env.CHROME_PATH
    ||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);
  return {headless:true,...(executablePath?{executablePath}:{})};
}
