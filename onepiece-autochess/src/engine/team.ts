import type { CharacterDef, Content, Star, SynergyStat, Unit } from '../shared/types.js';

export type Bonus = Partial<Record<SynergyStat, number>>;

export interface UnitStats {
  hp: number;
  attack: number;
  armor: number;
  range: number;
  cooldown: number;
  maxMana: number;
}

export function getCharacter(content: Content, defId: string): CharacterDef {
  const def = content.characters.find((c) => c.id === defId);
  if (!def) throw new Error(`Personaje desconocido: ${defId}`);
  return def;
}

/** Número de unidades distintas por facción en un conjunto de piezas. */
export function factionCounts(units: readonly Unit[], content: Content): Map<string, number> {
  const counts = new Map<string, number>();
  for (const u of units) {
    const faction = getCharacter(content, u.defId).faction;
    counts.set(faction, (counts.get(faction) ?? 0) + 1);
  }
  return counts;
}

/** Bonus activo de una facción según cuántas unidades la componen (se usa el tier más alto alcanzado). */
export function factionBonus(content: Content, faction: string, count: number): Bonus {
  const syn = content.synergies[faction];
  if (!syn) return {};
  let active: Bonus = {};
  for (const tier of syn.tiers) {
    if (count >= tier.count) active = tier.bonus;
  }
  return active;
}

/** Tiers activos por facción, para mostrar en la interfaz. */
export function activeSynergies(content: Content, units: readonly Unit[]) {
  const counts = factionCounts(units, content);
  return [...counts.entries()].map(([faction, count]) => {
    const syn = content.synergies[faction];
    const tiers = syn?.tiers ?? [];
    const active = [...tiers].filter((t) => count >= t.count).pop() ?? null;
    const next = tiers.find((t) => count < t.count) ?? null;
    return { faction, name: syn?.name ?? faction, count, active, next };
  });
}

/** Estadísticas finales de una pieza: estrella, sinergias aplicadas incluidas. */
export function unitStats(content: Content, unit: Unit, units: readonly Unit[]): UnitStats {
  const def = getCharacter(content, unit.defId);
  const counts = factionCounts(units, content);
  const bonus = factionBonus(content, def.faction, counts.get(def.faction) ?? 0);
  const mult = content.economy.starMultiplier[unit.star - 1] ?? 1;
  const hpPct = 1 + (bonus.hpPct ?? 0) / 100;
  const atkPct = 1 + (bonus.attackPct ?? 0) / 100;
  const cdPct = 1 - (bonus.cooldownPct ?? 0) / 100;
  return {
    hp: Math.round(def.hp * mult * hpPct),
    attack: Math.round(def.attack * mult * atkPct),
    armor: def.armor + (bonus.armor ?? 0),
    range: def.range,
    cooldown: Math.max(1, Math.round(def.cooldown * cdPct)),
    maxMana: def.ability.manaCost,
  };
}

/** Coste de la pieza en copias del pool (3 copias de estrella n forman una de estrella n+1). */
export function copiesOf(star: Star): number {
  return 3 ** (star - 1);
}
