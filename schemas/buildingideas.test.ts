import { describe, expect, it } from 'vitest';
import { buildingTypes, ideaErrors, type BuildingIdea } from './buildingideas.ts';

const types = buildingTypes([{ id: 'market_row', name: 'Market Row', district: 'oldtown', storeys: [2, 4] }]);
const row = types.find((t) => t.type === 'style_market_row')!, fire = types.find((t) => t.type === 'station_fire')!;
const idea = (more: Partial<BuildingIdea> = {}): BuildingIdea => ({ id: 'new_row', type: row.type, name: 'Cooper Row', concept: 'A narrow brick row with deep oriel windows stepping out over the pavement above each shop.', storeys: 3, wide: 12, deep: 14, roof: 'pitched', walls: 'warm red brick', features: ['oriel windows', 'stone cills', 'timber shopfronts'], ...more });

describe('building ideas', () => {
  it('covers every style, every station and the places that are buildings', () => { expect(types).toHaveLength(13); expect(types.some((t) => t.type === 'place_park')).toBe(false); });
  it('accepts a sound idea', () => { expect(ideaErrors(idea(), row)).toEqual([]); });
  it('keeps a style to its own storeys', () => { expect(ideaErrors(idea({ storeys: 9 }), row).join()).toMatch(/storeys 9/); });
  it('refuses half a storey', () => { expect(ideaErrors(idea({ storeys: 2.5 }), row).join()).toMatch(/whole number/); });
  it('refuses a name already in the town', () => { expect(ideaErrors(idea({ name: 'market row' }), row, ['Market Row']).join()).toMatch(/taken/); });
  it('holds the footprint to the type', () => { expect(ideaErrors(idea({ wide: 90 }), row).join()).toMatch(/wide 90/); });
  it('refuses a roof it has no form for', () => { expect(ideaErrors(idea({ roof: 'dome' as never }), row).join()).toMatch(/roof must/); });
  it('follows the town rules on tall roofs', () => { const tall = { ...row, storeys: [2, 10] as [number, number] }; expect(ideaErrors(idea({ storeys: 8 }), tall).join()).toMatch(/pitched/); expect(ideaErrors(idea({ roof: 'setback' }), row).join()).toMatch(/setback/); });
  it('keeps a fire station to its three bays', () => { const f = idea({ type: fire.type, wide: 24, deep: 16, storeys: 2, bays: 2 }); expect(ideaErrors(f, fire).join()).toMatch(/bays 2/); expect(ideaErrors({ ...f, bays: 3 }, fire)).toEqual([]); });
  it('gives bays only to stations', () => { expect(ideaErrors(idea({ bays: 2 }), row).join()).toMatch(/only a station/); });
  it('keeps out what the drawing must not show', () => { expect(ideaErrors(idea({ features: ['oriel windows', 'gold lettering', 'stone cills'] }), row).join()).toMatch(/lettering/); });
});
