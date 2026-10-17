/* The lower island, edited by hand. The meadow, plateau, ruins, cliffside, and shrine are not in this file.
   Coordinates are authored u, v before the K spread: u runs to the right of the screen, v toward the camera.
   Extend the ground with an ellipse [centerU, centerV, radiusU, radiusV] that reaches into open air,
   not into those upper terraces. Dress it by appending a place. Kinds: pillar, ruin, stones, lamp. */

export const parts = [
  [-13, 15, 13, 8],
  [-20, 11.5, 7, 5.5],
];

export const places = [
  { kind: "pillar", u: -18.4, v: 14.6, blocks: 4, ry: 0.25 },
  { kind: "pillar", u: -14.8, v: 18.2, blocks: 3, ry: 0.8 },
  { kind: "pillar", u: -9.2, v: 18.4, blocks: 3, ry: 0.1 },
  { kind: "ruin", u: -7.2, v: 15.2, blocks: 3, ry: 0.5 },
  { kind: "ruin", u: -20.6, v: 9.4, blocks: 2, ry: -0.4 },
  { kind: "stones", u: -12.2, v: 17.2, s: 0.85 },
  { kind: "stones", u: -17.2, v: 12.2, s: 0.7 },
  { kind: "stones", u: -21.8, v: 13.8, s: 1 },
  { kind: "lamp", u: -15.4, v: 15.2, faceU: -16.2, faceV: 16.4 },
];
