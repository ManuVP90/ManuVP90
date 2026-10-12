export type Cost = 1 | 2 | 3 | 4 | 5;
export type Star = 1 | 2 | 3;
export type AbilityKind = 'bonus_damage' | 'heal_ally';
export type Side = 0 | 1;

export interface Ability {
  name: string;
  kind: AbilityKind;
  amount: number;
  manaCost: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  faction: string;
  cost: Cost;
  hp: number;
  attack: number;
  armor: number;
  range: number;
  cooldown: number;
  ability: Ability;
}

export type SynergyStat = 'hpPct' | 'attackPct' | 'armor' | 'cooldownPct';

export interface SynergyTier {
  count: number;
  bonus: Partial<Record<SynergyStat, number>>;
}

export interface SynergyDef {
  name: string;
  tiers: SynergyTier[];
}

export interface Economy {
  startHp: number;
  startLevel: number;
  maxLevel: number;
  shopSize: number;
  benchSize: number;
  boardSlots: number;
  boardColumns: number;
  baseIncome: number;
  interestPer10: number;
  maxInterest: number;
  winStreakBonus: number[];
  rerollCost: number;
  levelUpCost: Record<string, number>;
  copiesByCost: Record<string, number>;
  shopOdds: Record<string, number[]>;
  starMultiplier: number[];
  combat: {
    tickLimit: number;
    manaPerAttack: number;
    manaPerHit: number;
    gridColumns: number;
    gridRows: number;
  };
}

export interface Content {
  characters: CharacterDef[];
  synergies: Record<string, SynergyDef>;
  economy: Economy;
}

/** Pieza concreta en juego: una copia de un personaje con su estrella. */
export interface Unit {
  uid: number;
  defId: string;
  star: Star;
}
