// Entry point. The app itself lives in main.js and is imported dynamically so that any
// startup failure (a module that fails to load, odd saved data, a screen that throws)
// ends on the localized error screen instead of a blank or frozen page.
import { showBootError } from './boot-error.js';

try {
  const { main } = await import('./main.js');
  await main();
} catch (e) {
  showBootError(e);
}
