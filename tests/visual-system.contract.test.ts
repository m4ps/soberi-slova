import { describe, expect, it } from 'vitest';

import {
  VISUAL_LAYOUT_HIERARCHY,
  createVisualSystemModule,
  visualButtonStateContracts,
  visualTokens,
} from '../src/adapters/VisualSystem';
import { MODULE_IDS } from '../src/shared/module-ids';

describe('VisualSystem contract', () => {
  it('registers a dedicated module with visual hierarchy and approved tokens', () => {
    const visualSystem = createVisualSystemModule();

    expect(visualSystem.moduleName).toBe(MODULE_IDS.visualSystem);
    expect(visualSystem.layoutHierarchy).toEqual(VISUAL_LAYOUT_HIERARCHY);
    expect(visualSystem.tokens).toBe(visualTokens);
    expect(visualTokens.accents.progressStartHex).toBe('#7ED8FF');
    expect(visualTokens.accents.progressEndHex).toBe('#7FF0D1');
    expect(visualTokens.accents.focusWordHex).toBe('#4AA7D8');
    expect(visualTokens.accents.targetSuccessHex).toBe('#77E39D');
    expect(visualTokens.accents.bonusSuccessHex).toBe('#FFBF76');
    expect(visualTokens.accents.hintHex).toBe('#4FD0C8');
    expect(visualTokens.accents.reshuffleHex).toBe('#6AA8FF');
    expect(visualTokens.accents.toastFailHex).toBe('#FF9B7B');
  });

  it('exposes button state contracts and motion timings through a single public API', () => {
    const visualSystem = createVisualSystemModule();

    expect(visualButtonStateContracts.hint.base.offsetY).toBe(0);
    expect(visualButtonStateContracts.hint.hover.offsetY).toBe(-2);
    expect(visualButtonStateContracts.hint.pressed.offsetY).toBe(1);
    expect(visualButtonStateContracts.hint.disabled.labelAlpha).toBeLessThan(
      visualButtonStateContracts.hint.base.labelAlpha,
    );
    expect(visualSystem.resolveButtonState('reshuffle', 'disabled')).toEqual(
      visualButtonStateContracts.reshuffle.disabled,
    );
    expect(visualTokens.motion.buttonHoverDurationMs).toBeGreaterThanOrEqual(140);
    expect(visualTokens.motion.buttonHoverDurationMs).toBeLessThanOrEqual(180);
    expect(visualTokens.motion.buttonPressDurationMs).toBeGreaterThanOrEqual(80);
    expect(visualTokens.motion.buttonPressDurationMs).toBeLessThanOrEqual(120);
    expect(visualTokens.motion.targetWordTransitionDurationMs).toEqual({
      min: 180,
      max: 240,
      recommended: 220,
    });
  });
});
