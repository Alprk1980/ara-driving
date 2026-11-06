// Careers: sign on at a station or depot, take its vehicle out on a shift, and be paid what the job really pays. The
// numbers below are the research behind Stage D (asked for 2026-11-02, built 2026-11-06); where a source is weak or a
// number is only judged, the comment says so. The call texts are written by the local model and held to callErrors.
//
// Pay. A shift pays the job's real hourly wage for the time the work is booked to take, turned into Points at the game's
// £1.40 a Point (fuel and the bus fare, src/sim/economy.ts) and into game hours at 20 s each (a 480 s day). So a bus
// driver's median £16.30 an hour is about 11.6 Points every 20 s of booked driving. Freelance jobs come to roughly 8 an
// hour of game time, so signing on pays better, as it should for steady work.
//
// Annual salaries are turned into hourly pay over each job's real working week: 40 hours for police officers (their
// regulations' standard), 42 for wholetime firefighters (the Grey Book's), 37.5 for NHS staff (Agenda for Change), and
// 40 for drivers and mechanics, whose medians are already hourly.
import type { FleetId } from './fleet.ts';

export const CAREER_IDS = ['bus', 'recovery', 'mechanic', 'police', 'fire', 'ambulance'] as const;
export type CareerId = (typeof CAREER_IDS)[number];
export const WEEKS_PER_YEAR = 52.14;
const hourly = (perYear: number, weekHours: number) => Math.round((perYear / (weekHours * WEEKS_PER_YEAR)) * 100) / 100;

/** One step up a career: what it's called, what it pays an hour in pounds, the vehicles it may take out, and what it opens. */
export type CareerRank = { title: string; gbpHour: number; vehicles: FleetId[]; opens: string };

/** Jobs done before each rank: judged, so a rank comes every evening or two of play. Real ladders take years: a police
 *  constable's probation is two years, a firefighter is in development for two to three, a newly qualified paramedic
 *  moves from Band 5 to 6 after two. */
export const RANK_JOBS = [0, 8, 20] as const;

export const CAREERS: Record<CareerId, { name: string; who: string; base: string; ranks: [CareerRank, CareerRank, CareerRank] }> = {
  // ONS ASHE 2025 median for bus and coach drivers: £16.30 an hour (£33,947 a year), via a site reproducing the tables, so
  // check the ONS's own before quoting it. Trainee and senior rates aren't published nationally: examples either side.
  bus: {
    name: 'Bus driver', who: 'the bus garage', base: 'bus',
    ranks: [
      { title: 'Trainee driver', gbpHour: 14, vehicles: ['bus_single'], opens: 'The Inner Circle in a single decker' }, // example
      { title: 'Bus driver', gbpHour: 16.3, vehicles: ['bus_single', 'bus_double'], opens: 'The Outer Circle in a double decker' }, // ASHE 2025 median
      { title: 'Senior driver', gbpHour: 18.5, vehicles: ['bus_single', 'bus_double'], opens: 'Longer runs, better pay' }, // example
    ],
  },
  // Recovery adverts in 2025 (DWP Find a Job, IMI jobs board): £12.50-15 an hour for a 7.5 t driver, £33,700-37,000 a year
  // salaried, and £37,000-42,000 for heavy (HGV) recovery. Adverts are asking pay, not a survey, so this is a weak source.
  recovery: {
    name: 'Recovery driver', who: 'the recovery yard', base: 'recovery',
    ranks: [
      { title: 'Recovery driver', gbpHour: 15, vehicles: ['recovery_truck'], opens: 'Broken-down cars' }, // top of the hourly adverts
      { title: 'Accident recovery', gbpHour: hourly(35000, 40), vehicles: ['recovery_truck'], opens: 'Crash scenes, called with the police' }, // salaried adverts' middle
      { title: 'Senior recovery', gbpHour: hourly(39500, 40), vehicles: ['recovery_truck'], opens: 'Better pay' }, // heavy recovery adverts' middle
    ],
  },
  // ONS ASHE 2025 median for vehicle technicians, mechanics and electricians (SOC 5231): £16.95 an hour, via the same kind of
  // site. An apprentice is paid at least the apprentice minimum, £7.55 from April 2025 (GOV.UK). A master technician's
  // rate is an example.
  mechanic: {
    name: 'Roadside mechanic', who: 'the patrol base', base: 'mechanic',
    ranks: [
      { title: 'Apprentice', gbpHour: 7.55, vehicles: ['patrol_van'], opens: 'Batteries and tyres' },
      { title: 'Patrol technician', gbpHour: 16.95, vehicles: ['patrol_van'], opens: 'Every fault' },
      { title: 'Master technician', gbpHour: 20, vehicles: ['patrol_van'], opens: 'Better pay' }, // example
    ],
  },
  // Police pay in England and Wales from 1 September 2025 (the 4.2% award): a new constable starts on £31,164 on the national
  // scale. Mid-scale and sergeant figures conflict between sources; £38,000 and £48,129 are taken from one 2025/26 table
  // and are weak.
  police: {
    name: 'Police officer', who: 'the police station', base: 'police',
    ranks: [
      { title: 'Student officer', gbpHour: hourly(31164, 40), vehicles: ['police_van'], opens: 'Answering calls' },
      { title: 'Police constable', gbpHour: hourly(38000, 40), vehicles: ['police_van', 'police_car'], opens: 'The patrol car, and stopping drivers who break the law' },
      { title: 'Police sergeant', gbpHour: hourly(48129, 40), vehicles: ['police_van', 'police_car'], opens: 'Better pay' },
    ],
  },
  // NJC for Local Authority Fire and Rescue Services, circular NJC/3/25: from 1 July 2025 a firefighter in development earns
  // £30,384, a competent firefighter £38,881 and a competent crew manager £43,104. A good source.
  fire: {
    name: 'Firefighter', who: 'the fire station', base: 'fire',
    ranks: [
      { title: 'Firefighter (development)', gbpHour: hourly(30384, 42), vehicles: ['fire_engine'], opens: 'Fires and alarms' },
      { title: 'Firefighter', gbpHour: hourly(38881, 42), vehicles: ['fire_engine'], opens: 'Crash rescues' },
      { title: 'Crew manager', gbpHour: hourly(43104, 42), vehicles: ['fire_engine'], opens: 'Better pay' },
    ],
  },
  // NHS Agenda for Change 2025/26 (England, the 3.6% award): Band 3 starts at £24,937 (an emergency care assistant), Band 5
  // at £31,049 (a newly qualified paramedic) and Band 6 at £38,682 (a paramedic after two years; from memory of the
  // published table, which the search didn't show). A rapid response car carries one paramedic and no stretcher.
  ambulance: {
    name: 'Ambulance crew', who: 'the ambulance station', base: 'ambulance',
    ranks: [
      { title: 'Emergency care assistant', gbpHour: hourly(24937, 37.5), vehicles: ['ambulance'], opens: 'Answering 999 calls' },
      { title: 'Paramedic', gbpHour: hourly(31049, 37.5), vehicles: ['ambulance'], opens: 'Better pay' },
      { title: 'Senior paramedic', gbpHour: hourly(38682, 37.5), vehicles: ['ambulance', 'rrv'], opens: 'The rapid response car' },
    ],
  },
};

export const careerRank = (jobs: number) => RANK_JOBS.filter((n) => jobs >= n).length - 1;

/** What a call is, for the careers that answer them. `blue`: on blue lights. `hold`: seconds of work at the scene.
 *  `convey`: the patient goes to the clinic. `fix`: the odds a roadside mechanic mends it there and then.
 *
 *  Ambulance: NHS England's Ambulance Response Programme. Category 1 (life-threatening) has a 7 minute mean target,
 *  Category 2 (emergency, such as a stroke) 18 minutes, Category 3 (urgent) 2 hours; only 1 and 2 go on blue lights.
 *  About half of incidents are taken to hospital (NHS Ambulance Quality Indicators: a weak, from-memory figure).
 *  Fire: in England about two in five incidents are false alarms (Home Office fire statistics), so they are a real
 *  share of calls. Police: forces grade calls as emergency (blue lights) or priority (as soon as possible, no blues).
 *  Breakdowns: a flat or faulty battery is the most common cause in RAC and AA figures, and patrols fix about four in
 *  five at the roadside (the AA's own claim). Hold times are judged, as real jobs take tens of minutes. */
export const CALL_KINDS = {
  ambulance: { cat1: { blue: true, hold: 16, convey: true }, cat2: { blue: true, hold: 14, convey: true }, cat3: { blue: false, hold: 12, convey: false } },
  fire: { house_fire: { blue: true, hold: 22 }, car_fire: { blue: true, hold: 16 }, bin_fire: { blue: true, hold: 12 }, rescue: { blue: true, hold: 18 }, false_alarm: { blue: true, hold: 8 } },
  police: { emergency: { blue: true, hold: 12 }, priority: { blue: false, hold: 10 } },
  mechanic: { battery: { hold: 12, fix: 0.95 }, tyre: { hold: 14, fix: 0.9 }, fuel: { hold: 8, fix: 1 }, keys: { hold: 10, fix: 0.8 }, engine: { hold: 16, fix: 0.5 } },
  recovery: { engine: { hold: 12 }, clutch: { hold: 12 }, gearbox: { hold: 12 } },
} as const;
export type CallCareer = keyof typeof CALL_KINDS;
export const CALL_CAREERS = Object.keys(CALL_KINDS) as CallCareer[];
export type CallCard = { id: string; career: CallCareer; kind: string; title: string; text: string };

/** Only the rarer kinds wait for rank: mechanics start on batteries and tyres. */
export const RANK_KINDS: Partial<Record<CallCareer, string[]>> = { mechanic: ['battery', 'tyre', 'fuel'] };

// A family game: no hurt described, nothing frightening, no weapons. A call says where with {place}, which the game fills.
const BANNED = /\b(blood|bleed|bleeding|dead|death|die|dying|kill|killed|gun|knife|stab|weapon|attack|assault|overdose|drunk|crash victim|injur\w*|unconscious|not breathing|cardiac arrest)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u, ID = /^[a-z][a-z0-9_]*$/;

export function callErrors(c: CallCard): string[] {
  if (!c || typeof c !== 'object') return ['call is not an object'];
  const out: string[] = [];
  if (!ID.test(c.id ?? '')) out.push(`id "${c.id}": snake_case`);
  const kinds = CALL_KINDS[c.career as CallCareer];
  if (!kinds) return [...out, `${c.id}: career must be one of ${CALL_CAREERS.join(', ')}`];
  if (!(c.kind in kinds)) out.push(`${c.id}: a ${c.career} call's kind is one of ${Object.keys(kinds).join(', ')}`);
  if (typeof c.title !== 'string' || c.title.length < 4 || c.title.length > 36 || /\d/.test(c.title)) out.push(`${c.id}: title is 4-36 characters, no digits`);
  if (typeof c.text !== 'string' || c.text.length < 20 || c.text.length > 110) out.push(`${c.id}: text is 20-110 characters`);
  else {
    if ((c.text.match(/\{place\}/g) ?? []).length !== 1) out.push(`${c.id}: text says where with {place} exactly once`);
    if (/\d/.test(c.text.replace('{place}', ''))) out.push(`${c.id}: no digits in the text`);
  }
  if (BANNED.test(`${c.title} ${c.text}`)) out.push(`${c.id}: a family game: nothing hurt, frightening or violent (no ${BANNED.exec(`${c.title} ${c.text}`)![0]})`);
  if (EMOJI.test(`${c.title} ${c.text}`)) out.push(`${c.id}: no emoji`);
  return out;
}

/** The set: every kind of every career has a call, so the game can always deal one. */
export function callSetErrors(calls: CallCard[]): string[] {
  const out: string[] = [];
  for (const career of CALL_CAREERS) for (const kind of Object.keys(CALL_KINDS[career])) if (!calls.some((c) => c.career === career && c.kind === kind)) out.push(`no ${career} call of kind ${kind}`);
  return out;
}

/** What a depot's name has to say for a career to sign on there: the bus garage, the recovery yard and the patrol base
 *  are the town's depots, chosen by name. The blue-light services have stations of their own. */
export const BASE_SAYS: Record<'bus' | 'recovery' | 'mechanic', RegExp> = {
  bus: /\b(bus|coach|omnibus|transit)\b/i,
  recovery: /\b(recovery|tow|towing|rescue)\b/i,
  mechanic: /\b(garage|motors?|repairs?|patrol|breakdown|service)\b/i,
};
