import { defaultConfig, type CharacterConfig } from './character.ts';

/** How the story characters look in their portraits. */
export const NPC_LOOKS: Record<string, CharacterConfig> = {
  beto: {
    ...defaultConfig('male'), skin: '#a4663f', hairStyle: 'curly_top', hairColor: '#e8e8ee', eyeColor: '#3b2112',
    top: 'hoodie', topColor: '#7a1b1b', glasses: true,
  },
  rosa: {
    ...defaultConfig('female'), skin: '#7b4527', hairStyle: 'bob_bangs', hairColor: '#e8e8ee', eyeColor: '#3b2112',
    top: 'tshirt', topColor: '#e63a2e',
  },
  ferro: {
    ...defaultConfig('male'), skin: '#d8a37a', hairStyle: 'side_part', hairColor: '#2a1a12', eyeColor: '#3b2112',
    top: 'tshirt', topColor: '#1b2f6a', bottomColor: '#15204a', cap: true, capColor: '#10204a',
  },
  bruno: {
    ...defaultConfig('male'), skin: '#e0b48c', hairStyle: 'side_part', hairColor: '#9a9aa8', eyeColor: '#3b2112',
    top: 'tshirt', topColor: '#1f1f2b', bottomColor: '#15151d', glasses: true,
  },
  zeta: {
    ...defaultConfig('male'), skin: '#f4cfb2', hairStyle: 'side_part', hairColor: '#120d0b', eyeColor: '#7a8794',
    top: 'hoodie', topColor: '#1b1f3a', glasses: true,
  },
};
