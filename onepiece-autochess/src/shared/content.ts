import charactersJson from '../../data/characters.json' with { type: 'json' };
import synergiesJson from '../../data/synergies.json' with { type: 'json' };
import economyJson from '../../data/economy.json' with { type: 'json' };
import type { CharacterDef, Content, Economy, SynergyDef } from './types.js';

/** Carga el contenido de `data/` y lo valida. Lanza un error con todos los problemas encontrados. */
export function loadContent(): Content {
  return validateContent({
    characters: charactersJson as CharacterDef[],
    synergies: synergiesJson as Record<string, SynergyDef>,
    economy: economyJson as Economy,
  });
}

/** Comprueba referencias y rangos del contenido. Devuelve el mismo objeto si es válido. */
export function validateContent(content: Content): Content {
  const errors: string[] = [];
  const ids = new Set<string>();
  const { characters, synergies, economy } = content;

  for (const c of characters) {
    if (ids.has(c.id)) errors.push(`id de personaje duplicado: ${c.id}`);
    ids.add(c.id);
    if (!synergies[c.faction]) errors.push(`${c.id}: facción desconocida "${c.faction}"`);
    if (![1, 2, 3, 4, 5].includes(c.cost)) errors.push(`${c.id}: coste fuera de 1-5`);
    if (c.hp <= 0 || c.attack <= 0) errors.push(`${c.id}: hp y ataque deben ser positivos`);
    if (c.range < 1) errors.push(`${c.id}: rango mínimo 1`);
    if (c.cooldown < 1) errors.push(`${c.id}: cooldown mínimo 1`);
    if (c.ability.manaCost <= 0) errors.push(`${c.id}: manaCost debe ser positivo`);
  }

  for (const [key, syn] of Object.entries(synergies)) {
    const counts = syn.tiers.map((t) => t.count);
    if ([...counts].sort((a, b) => a - b).join() !== counts.join()) {
      errors.push(`sinergia ${key}: los tiers deben estar ordenados por count`);
    }
  }

  const copyCosts = Object.keys(economy.copiesByCost);
  for (let cost = 1; cost <= 5; cost++) {
    if (!copyCosts.includes(String(cost))) errors.push(`copiesByCost sin coste ${cost}`);
  }
  for (const [level, odds] of Object.entries(economy.shopOdds)) {
    const total = odds.reduce((a, b) => a + b, 0);
    if (total !== 100) errors.push(`shopOdds nivel ${level} suma ${total}, debe ser 100`);
  }

  if (errors.length > 0) throw new Error(`Contenido inválido:\n- ${errors.join('\n- ')}`);
  return content;
}
