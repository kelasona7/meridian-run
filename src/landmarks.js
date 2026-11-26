// Landmarks that make the Meridian Isles read as a real place: a lighthouse
// on the west headland, a beacon on the north island, a windmill on the east
// hill, a harbour town on the south coast, and boats in the south water.
// Pure scenery — nothing here touches the flight model, the course or the
// terrain heights. Positions sit on the ground via world.heightAt, so the
// same seed always builds the same landmarks.
export function createLandmarks(world) {
  const at = (x, z) => ({ x, y: world.heightAt(x, z), z });

  // The west headland, seen from the ring course; the north island peak,
  // seen down the runway on final approach.
  const lighthouse = { ...at(-800, -100), kind: 'lighthouse', scale: 1 };
  const beacon = { ...at(250, -1450), kind: 'lighthouse', scale: 0.65 };
  const windmill = { ...at(650, -350), kind: 'windmill' };

  // Harbour town: three loose rows of houses along the south coast, just
  // north of the spawn — the plane flies over it in the first seconds.
  const wallColors = ['#f2e3c2', '#e8d9b0', '#f7ead0', '#e3cfa5'];
  const roofColors = ['#b8543f', '#c96f4a', '#a84a3a', '#8a5a3b'];
  const spots = [
    [-20, 990], [40, 988], [100, 992], [160, 986], [220, 994],
    [10, 1040], [70, 1044], [130, 1038], [190, 1046], [250, 1040],
    [40, 1090], [110, 1094], [180, 1088], [240, 1092],
  ];
  const houses = spots.map(([x, z], i) => ({
    ...at(x, z),
    kind: 'house',
    w: 9 + (i % 3) * 2.5,
    h: 6 + (i % 4) * 1.5,
    wall: wallColors[i % wallColors.length],
    roof: roofColors[(i * 2 + 1) % roofColors.length],
  }));

  // Boats anchored in the open water south of the town.
  const boats = [
    { x: 150, y: 1, z: 1700, heading: 0.4 },
    { x: -80, y: 1, z: 1750, heading: -0.7 },
    { x: 360, y: 1, z: 1680, heading: 1.2 },
  ];

  return { lighthouse, beacon, windmill, houses, boats };
}
