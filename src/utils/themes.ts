import { ThemeId, GameTheme } from '../types';

export const THEMES: Record<ThemeId, GameTheme> = {
  arcade: {
    id: 'arcade',
    name: 'Retro Arcade',
    colors: [
      '#FF595E', // Coral Red
      '#FFCA3A', // Sunburst Yellow
      '#8AC926', // Lime Green
      '#1982C4', // Ocean Blue
      '#6A4C93', // Royal Purple
      '#FF924C', // Sunset Orange
      '#00B4D8', // Cyan Teal
      '#E0115F', // Ruby Rose
    ],
    colorNames: [
      'Coral Red',
      'Sunburst',
      'Lime Green',
      'Ocean Blue',
      'Purple',
      'Orange',
      'Cyan',
      'Ruby',
    ],
    boardBg: 'bg-slate-900/95',
    boardBorder: 'border-slate-700/60',
    cellRadius: 'rounded-[3px] sm:rounded-sm',
    glowP1:
      'ring-1 sm:ring-[1.5px] ring-cyan-400/80 shadow-[0_0_8px_rgba(34,211,238,0.35)]',
    glowP2:
      'ring-1 sm:ring-[1.5px] ring-rose-400/80 shadow-[0_0_8px_rgba(251,113,133,0.35)]',
  },
  neon: {
    id: 'neon',
    name: 'Cyber Neon',
    colors: [
      '#FF0055', // Neon Pink
      '#00F0FF', // Electric Cyan
      '#39FF14', // Laser Lime
      '#FFE600', // Acid Yellow
      '#BD00FF', // Cyber Violet
      '#FF6B00', // Hyper Orange
      '#00FFB2', // Mint Neon
      '#FF0099', // Hot Fuchsia
    ],
    colorNames: [
      'Neon Pink',
      'Electric Cyan',
      'Laser Lime',
      'Acid Yellow',
      'Cyber Violet',
      'Hyper Orange',
      'Mint Neon',
      'Hot Fuchsia',
    ],
    boardBg: 'bg-black/95',
    boardBorder: 'border-cyan-500/40',
    cellRadius: 'rounded-[2px] sm:rounded',
    glowP1: 'ring-1 sm:ring-[2px] ring-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.6)]',
    glowP2: 'ring-1 sm:ring-[2px] ring-fuchsia-400 shadow-[0_0_12px_rgba(255,0,85,0.6)]',
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset Dusk',
    colors: [
      '#F43F5E', // Rose Glow
      '#FB923C', // Warm Amber
      '#FBBF24', // Golden Sun
      '#6366F1', // Twilight Indigo
      '#A855F7', // Mystic Purple
      '#EC4899', // Dusk Pink
      '#06B6D4', // Sky Lagoon
      '#E11D48', // Crimson Red
    ],
    colorNames: [
      'Rose Glow',
      'Warm Amber',
      'Golden Sun',
      'Twilight Indigo',
      'Mystic Purple',
      'Dusk Pink',
      'Sky Lagoon',
      'Crimson Red',
    ],
    boardBg: 'bg-slate-950/90',
    boardBorder: 'border-purple-800/40',
    cellRadius: 'rounded-[4px] sm:rounded-md',
    glowP1: 'ring-1 sm:ring-[1.5px] ring-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.4)]',
    glowP2: 'ring-1 sm:ring-[1.5px] ring-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.4)]',
  },
  pastel: {
    id: 'pastel',
    name: 'Candy Pastel',
    colors: [
      '#FFAAA6', // Strawberry Milk
      '#FFD3B5', // Peach Cream
      '#DCEDC2', // Mint Foam
      '#A8E6CF', // Soft Seafoam
      '#A0C4FF', // Powder Sky
      '#BDB2FF', // Soft Lilac
      '#FFC6FF', // Bubblegum
      '#FDFFB6', // Lemon Butter
    ],
    colorNames: [
      'Strawberry',
      'Peach Cream',
      'Mint Foam',
      'Soft Seafoam',
      'Powder Sky',
      'Lilac',
      'Bubblegum',
      'Lemon Butter',
    ],
    boardBg: 'bg-slate-900/95',
    boardBorder: 'border-pink-500/30',
    cellRadius: 'rounded-md',
    glowP1: 'ring-1 sm:ring-[1.5px] ring-teal-300 shadow-[0_0_8px_rgba(168,230,207,0.4)]',
    glowP2: 'ring-1 sm:ring-[1.5px] ring-pink-300 shadow-[0_0_8px_rgba(255,170,166,0.4)]',
  },
  frost: {
    id: 'frost',
    name: 'Nordic Frost',
    colors: [
      '#0284C7', // Deep Azure
      '#38BDF8', // Glacier Sky
      '#2DD4BF', // Arctic Teal
      '#F472B6', // Aurora Berry
      '#818CF8', // Frost Iris
      '#FCD34D', // Pale Sun
      '#34D399', // Alpine Pine
      '#FB7185', // Rose Ice
    ],
    colorNames: [
      'Deep Azure',
      'Glacier Sky',
      'Arctic Teal',
      'Aurora Berry',
      'Frost Iris',
      'Pale Sun',
      'Alpine Pine',
      'Rose Ice',
    ],
    boardBg: 'bg-slate-950/95',
    boardBorder: 'border-sky-700/50',
    cellRadius: 'rounded-[3px] sm:rounded-sm',
    glowP1: 'ring-1 sm:ring-[1.5px] ring-cyan-300 shadow-[0_0_8px_rgba(56,189,248,0.4)]',
    glowP2: 'ring-1 sm:ring-[1.5px] ring-rose-300 shadow-[0_0_8px_rgba(251,113,133,0.4)]',
  },
  botanical: {
    id: 'botanical',
    name: 'Forest Botanica',
    colors: [
      '#2E7D32', // Fern Green
      '#F59E0B', // Wild Marigold
      '#D97706', // Ochre Clay
      '#2563EB', // River Azure
      '#7C3AED', // Forest Violet
      '#DC2626', // Winter Berry
      '#059669', // Moss Emerald
      '#0891B2', // Deep Lake
    ],
    colorNames: [
      'Fern Green',
      'Marigold',
      'Ochre Clay',
      'River Azure',
      'Forest Violet',
      'Winter Berry',
      'Moss Emerald',
      'Deep Lake',
    ],
    boardBg: 'bg-zinc-950/95',
    boardBorder: 'border-emerald-800/40',
    cellRadius: 'rounded-[3px] sm:rounded-sm',
    glowP1:
      'ring-1 sm:ring-[1.5px] ring-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.4)]',
    glowP2: 'ring-1 sm:ring-[1.5px] ring-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.4)]',
  },
  jewel: {
    id: 'jewel',
    name: 'Obsidian Jewel',
    colors: [
      '#E11D48', // Ruby
      '#D97706', // Topaz
      '#059669', // Emerald
      '#2563EB', // Sapphire
      '#9333EA', // Amethyst
      '#EA580C', // Spessartine
      '#0284C7', // Aquamarine
      '#BE185D', // Tourmaline
    ],
    colorNames: [
      'Ruby',
      'Topaz',
      'Emerald',
      'Sapphire',
      'Amethyst',
      'Spessartine',
      'Aquamarine',
      'Tourmaline',
    ],
    boardBg: 'bg-black/95',
    boardBorder: 'border-amber-500/30',
    cellRadius: 'rounded-[3px] sm:rounded-sm',
    glowP1: 'ring-1 sm:ring-[1.5px] ring-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.4)]',
    glowP2:
      'ring-1 sm:ring-[1.5px] ring-purple-300 shadow-[0_0_8px_rgba(216,180,254,0.4)]',
  },
  emoji: {
    id: 'emoji',
    name: 'Emoji Party',
    // Every palette slot carries an emoji, so a flat board can be read by
    // picture alone (red heart, ocean wave, lemon, leaf, grapes, fire,
    // diamond, blossom). Flat boards draw the glyphs with no colour fill; the
    // 3D cube ignores `emoji` and keeps these colours as its fills.
    colors: [
      '#E11D48', // Red Heart
      '#1D4ED8', // Ocean Wave
      '#FACC15', // Lemon
      '#16A34A', // Leaf
      '#7C3AED', // Grapes
      '#F97316', // Fire
      '#06B6D4', // Diamond
      '#EC4899', // Blossom
    ],
    colorNames: [
      'Red Heart',
      'Ocean Wave',
      'Lemon',
      'Leaf',
      'Grapes',
      'Fire',
      'Diamond',
      'Blossom',
    ],
    emoji: ['❤️', '🌊', '🍋', '🌿', '🍇', '🔥', '💎', '🌸'],
    boardBg: 'bg-slate-900/95',
    boardBorder: 'border-fuchsia-500/30',
    cellRadius: 'rounded-md',
    glowP1: 'ring-1 sm:ring-[1.5px] ring-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.45)]',
    glowP2: 'ring-1 sm:ring-[1.5px] ring-pink-300 shadow-[0_0_8px_rgba(236,72,153,0.45)]',
  },
  colorblind: {
    id: 'colorblind',
    name: 'Color Safe',
    // P5.4: Okabe-Ito palette (color-vision-deficiency-safe). Slot order is a
    // luminance walk (verified by test): every adjacent pair keeps ≥ 1.6:1
    // contrast so cells stay tellable even with zero hue perception.
    // 'Mist Grey' replaces Okabe-Ito black (invisible on a dark board) and
    // bridges to the dark green tail.
    colors: [
      '#0072B2', // Deep Blue
      '#CC79A7', // Blush Purple
      '#F0E442', // Bright Yellow
      '#E69F00', // Amber Orange
      '#D55E00', // Vermillion
      '#56B4E9', // Sky Blue
      '#E8EAF0', // Mist Grey
      '#009E73', // Teal Green
    ],
    colorNames: [
      'Deep Blue',
      'Blush Purple',
      'Bright Yellow',
      'Amber Orange',
      'Vermillion',
      'Sky Blue',
      'Mist Grey',
      'Teal Green',
    ],
    boardBg: 'bg-slate-950/95',
    boardBorder: 'border-slate-500/40',
    cellRadius: 'rounded-[3px] sm:rounded-sm',
    glowP1: 'ring-1 sm:ring-[1.5px] ring-sky-300 shadow-[0_0_8px_rgba(86,180,239,0.45)]',
    glowP2:
      'ring-1 sm:ring-[1.5px] ring-yellow-300 shadow-[0_0_8px_rgba(240,228,66,0.45)]',
  },
};

export const PROGRESSIVE_STAGES = [
  {
    stageNumber: 1,
    name: 'Stage 1: Apprentice',
    gridSize: 10,
    colorCount: 4,
    description: 'Fast 10x10 sprint with 4 vivid colors. Easiest start!',
  },
  {
    stageNumber: 2,
    name: 'Stage 2: Tactical',
    gridSize: 12,
    colorCount: 5,
    description: '12x12 grid with 5 colors. Territory tactics begin.',
  },
  {
    stageNumber: 3,
    name: 'Stage 3: Strategic',
    gridSize: 14,
    colorCount: 6,
    description: '14x14 battlefield with 6 colors. Deep planning required.',
  },
  {
    stageNumber: 4,
    name: 'Stage 4: Grand Arena',
    gridSize: 16,
    colorCount: 6,
    description: '16x16 arena. High stakes board control!',
  },
  {
    stageNumber: 5,
    name: 'Stage 5: Master Mind',
    gridSize: 18,
    colorCount: 7,
    description: 'Epic 18x18 master showdown with 7 vibrant colors.',
  },
];
