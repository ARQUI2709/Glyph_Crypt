import { describe, it, expect } from 'vitest';
import { themeForChamber, theme } from '../src/render/theme';

describe('themeForChamber', () => {
  it('rotates the color palette every 5 chambers', () => {
    expect(themeForChamber(0).neon).toBe(themeForChamber(4).neon);
    expect(themeForChamber(0).neon).not.toBe(themeForChamber(5).neon);
    expect(themeForChamber(5).neon).toBe(themeForChamber(9).neon);
  });

  it('rotates the wall texture every 10 chambers', () => {
    expect(themeForChamber(0).texture).toBe(themeForChamber(9).texture);
    expect(themeForChamber(0).texture).not.toBe(themeForChamber(10).texture);
  });

  it('is deterministic and keeps shared collectible colors constant', () => {
    expect(themeForChamber(3)).toEqual(themeForChamber(3));
    expect(themeForChamber(0).gold).toBe(themeForChamber(7).gold);
    expect(themeForChamber(0).spike).toBe(themeForChamber(12).spike);
  });

  it('exposes chamber 0 as the default `theme` (CSS mirror)', () => {
    expect(theme).toEqual(themeForChamber(0));
  });
});
