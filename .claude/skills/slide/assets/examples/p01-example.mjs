// In a deck, keep this file next to lib.mjs (diagrams/) and import './lib.mjs'.
import { C, box, rect, text, arrow, line, tr } from '../lib.mjs';
export const skeleton = [
  ...box(400, 245, 270, 120, 'Meme Launchpad', tr('issue: new assets\nand new users', '发行：新资产\n与新用户'), { ts: 26, ss: 20, stroke: C.text, sw: 3 }),
  rect(760, 220, 200, 170, { shape: 'ellipse', label: 'mStocks', size: 34, stroke: C.accent, sw: 4, color: C.accent }),
  arrow([[758, 305], [674, 305]]), text(684, 262, tr('quote', '计价'), { size: 20, color: C.text }),
];
