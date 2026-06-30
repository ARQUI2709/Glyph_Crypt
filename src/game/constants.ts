/** Milliseconds the player spends crossing one cell while sliding. */
export const MOVE_INTERVAL = 40;

/** Fixed on-screen size of one cell, in CSS px. Constant across every chamber: bigger boards
 *  scroll under a follow-camera rather than shrinking, so the zoom never changes. */
export const CELL_SIZE = 36;

/** Cells of look-ahead the camera leads the player by, in the current slide direction, so
 *  oncoming danger is on-screen before the player reaches it. */
export const CAMERA_LOOKAHEAD = 2.5;

/** Big stars per chamber (re-exported for UI convenience). */
export { STARS_PER_LEVEL } from '../core/level';
