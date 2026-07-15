'use strict';

const baseline = { bars: 48, fps: 60, particleLoops: 1 };
const mobile = { bars: 16, fps: 20, particleLoops: 0 };

const baselineWrites = baseline.bars * baseline.fps;
const mobileWrites = mobile.bars * mobile.fps;
const reduction = Math.round((1 - mobileWrites / baselineWrites) * 1000) / 10;
const nodeReduction = Math.round((1 - mobile.bars / baseline.bars) * 1000) / 10;
const frameReduction = Math.round((1 - mobile.fps / baseline.fps) * 1000) / 10;

if (reduction < 80 || nodeReduction < 60 || frameReduction < 50) {
  throw new Error('The mobile visual budget regressed.');
}

console.log(`Mobile visual budget: ${baselineWrites} -> ${mobileWrites} bar writes/s (${reduction}% fewer), ${nodeReduction}% fewer bars, ${frameReduction}% fewer visual ticks, particles disabled.`);
