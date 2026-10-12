import { describe, expect, it } from 'vitest';
import { simulateCombat } from '../src/engine/combat.js';
import { activeSynergies, unitStats } from '../src/engine/team.js';
import { boardWith, content, emptyBoard, unit } from './helpers.js';

describe('simulateCombat', () => {
  it('es determinista: el mismo input produce el mismo log', () => {
    const a = boardWith([[4, 'zoro'], [5, 'sanji'], [6, 'nami']]);
    const b = boardWith([[4, 'smoker'], [5, 'garp'], [6, 'tashigi']]);
    const first = simulateCombat(content, [a, b]);
    const second = simulateCombat(content, [structuredClone(a), structuredClone(b)]);
    expect(second.events).toEqual(first.events);
    expect(second.winner).toBe(first.winner);
  });

  it('gana el bando con más poder', () => {
    const strong = boardWith([[4, 'kaido'], [5, 'bigmom'], [0, 'akainu']]);
    const weak = boardWith([[4, 'koby'], [5, 'luffy']]);
    const result = simulateCombat(content, [strong, weak]);
    expect(result.winner).toBe(0);
    expect(result.survivors[1]).toBe(0);
  });

  it('un tablero vacío pierde de inmediato', () => {
    const result = simulateCombat(content, [boardWith([[4, 'luffy']]), emptyBoard()]);
    expect(result.winner).toBe(0);
    expect(result.ticks).toBe(0);
  });

  it('dos tableros vacíos empatan', () => {
    expect(simulateCombat(content, [emptyBoard(), emptyBoard()]).winner).toBeNull();
  });

  it('respeta el límite de ticks', () => {
    const result = simulateCombat(content, [boardWith([[4, 'luffy']]), boardWith([[4, 'luffy']])]);
    expect(result.ticks).toBeLessThanOrEqual(content.economy.combat.tickLimit);
  });

  it('el ataque nunca hace menos de 1 de daño', () => {
    const tank = boardWith([[4, 'kaido']]);
    const pest = boardWith([[4, 'koby']]);
    const events = simulateCombat(content, [pest, tank]).events;
    const hits = events.filter((e) => e.type === 'attack');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) if (h.type === 'attack') expect(h.damage).toBeGreaterThanOrEqual(1);
  });

  it('un curandero recupera vida de sus aliados', () => {
    // Con un rival que aguanta lo suficiente, Chopper llena su maná y cura a un aliado herido.
    const healer = boardWith([[4, 'chopper'], [5, 'luffy']]);
    const enemy = boardWith([[0, 'koby'], [1, 'koby']]);
    const { events } = simulateCombat(content, [healer, enemy]);
    const heals = events.filter((e) => e.type === 'ability' && e.kind === 'heal_ally');
    expect(heals.length).toBeGreaterThan(0);
  });
});

describe('sinergias y estadísticas', () => {
  it('activa el tier más alto alcanzado de una facción', () => {
    const team = [unit('zoro'), unit('nami'), unit('usopp'), unit('luffy')];
    const syn = activeSynergies(content, team).find((s) => s.faction === 'strawhat');
    expect(syn?.count).toBe(4);
    expect(syn?.active?.count).toBe(4);
    expect(syn?.next?.count).toBe(6);
  });

  it('una estrella superior multiplica las estadísticas base', () => {
    const team1 = [unit('zoro', 1)];
    const team2 = [unit('zoro', 2)];
    const s1 = unitStats(content, team1[0]!, team1);
    const s2 = unitStats(content, team2[0]!, team2);
    expect(s2.hp).toBeGreaterThan(s1.hp);
    expect(s2.attack).toBeGreaterThan(s1.attack);
  });
});
