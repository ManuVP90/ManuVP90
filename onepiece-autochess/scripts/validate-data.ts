import { loadContent } from '../src/shared/content.js';

try {
  const content = loadContent();
  console.log(
    `OK: ${content.characters.length} personajes, ${Object.keys(content.synergies).length} facciones, economía válida.`,
  );
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
