/**
 * Where a driver sits, shared by the figure seen from outside and the cockpit camera so the two can't disagree. Pure.
 * The town drives on the left, so the seat is on the right: -x, as forward is +z.
 */

/** The eye point sits 635 mm above the seat reference point (UN Regulation 125, the forward field of vision). */
export const EYE_ABOVE_SEAT = 0.635;
// The rest are judged from typical cars: no public source gave them, as they live in paywalled SAE packaging standards.
const SEAT_ABOVE_FLOOR = 0.2, SEAT_OUT = 0.37, EYE_TO_SCREEN = 1.02, HIPS_AHEAD_OF_EYES = 0.2, HEADROOM = 0.13;
const WHEEL_BELOW_EYE = 0.36, WHEEL_AHEAD_OF_EYE = 0.6, EYE_OVER_BELT = 0.14;
const FIGURE_EYES = 0.7; // how high the driver figure's eyes are above its hips, before scaling

export const WHEEL_RADIUS = 0.185; // a wheel of about 370 mm
export const WHEEL_RAKE = 0.38; // leaning back about 22 degrees
export const RECLINE = 0.3; // the seat back, about 17 degrees

export type Cabin = { floor: number; belt: number; roof: number; front: number; back: number; wide: number };

export function drivingPosition(c: Cabin) {
  const seatY = Math.max(c.floor + SEAT_ABOVE_FLOOR, c.belt + EYE_OVER_BELT - EYE_ABOVE_SEAT); // a tall vehicle's seat rises with its windows
  const eyeY = Math.min(seatY + EYE_ABOVE_SEAT, c.roof - HEADROOM); // a low roof means sitting lower and further back, as in a sports car
  const eyeZ = Math.max(c.front - EYE_TO_SCREEN, c.back + 0.3);
  const x = -Math.min(SEAT_OUT, c.wide * 0.21);
  return {
    seat: { x, y: seatY, z: eyeZ + HIPS_AHEAD_OF_EYES, scale: (eyeY - seatY) / FIGURE_EYES },
    eye: { x, y: eyeY, z: eyeZ },
    wheel: { x, y: eyeY - WHEEL_BELOW_EYE, z: eyeZ + WHEEL_AHEAD_OF_EYE },
  };
}
