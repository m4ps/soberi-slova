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
    expect(visualTokens.shell.appBackgroundHex).toBe('#F5FAFF');
    expect(visualTokens.shell.appBackgroundEndHex).toBe('#FCFEFF');
    expect(visualTokens.shell.appCloudCoolHex).toBe('#DDEFFC');
    expect(visualTokens.accents.progressStartHex).toBe('#7ED8FF');
    expect(visualTokens.accents.progressEndHex).toBe('#7FF0D1');
    expect(visualTokens.accents.focusWordHex).toBe('#4AA7D8');
    expect(visualTokens.accents.targetSuccessHex).toBe('#77E39D');
    expect(visualTokens.accents.bonusSuccessHex).toBe('#FFBF76');
    expect(visualTokens.accents.hintHex).toBe('#4FD0C8');
    expect(visualTokens.accents.reshuffleHex).toBe('#6AA8FF');
    expect(visualTokens.accents.toastFailHex).toBe('#FF9B7B');
    expect(visualTokens.progressBar.glowHex).toBe('#7FF0D1');
    expect(visualTokens.progressBar.particleHex).toBe('#F7FFFC');
    expect(visualTokens.progressBar.particleAccentHex).toBe('#7FF0D1');
    expect(visualTokens.panels.metricsRow.fillAlpha).toBeLessThan(
      visualTokens.panels.metric.fillAlpha,
    );
    expect(visualTokens.panels.controls.fillAlpha).toBeLessThan(
      visualTokens.panels.currentWord.fillAlpha,
    );
    expect(visualTokens.stroke.panelWidth).toBeGreaterThan(0);
    expect(visualTokens.surfaces.metricsRow.shadowAlpha).toBeLessThan(
      visualTokens.surfaces.metric.shadowAlpha,
    );
    expect(visualTokens.surfaces.controls.shadowAlpha).toBeLessThan(
      visualTokens.surfaces.metric.shadowAlpha,
    );
    expect(visualTokens.surfaces.gridCell.highlightAlpha).toBeGreaterThan(0.7);
    expect(visualTokens.typography.fontFamily).toContain('Avenir');
    expect(visualTokens.currentWord.blurStrength).toBeGreaterThan(0);
  });

  it('exposes button state contracts and motion timings through a single public API', () => {
    const visualSystem = createVisualSystemModule();

    expect(visualButtonStateContracts.hint.base.offsetY).toBe(0);
    expect(visualButtonStateContracts.hint.hover.offsetY).toBe(-2);
    expect(visualButtonStateContracts.hint.focus.glowAlpha).toBeGreaterThan(
      visualButtonStateContracts.hint.hover.glowAlpha,
    );
    expect(visualButtonStateContracts.hint.hover.shadowAlpha).toBeGreaterThan(
      visualButtonStateContracts.hint.base.shadowAlpha,
    );
    expect(visualButtonStateContracts.hint.pressed.shadowAlpha).toBeLessThan(
      visualButtonStateContracts.hint.base.shadowAlpha,
    );
    expect(visualButtonStateContracts.hint.pressed.bloomAlpha).toBeLessThan(
      visualButtonStateContracts.hint.hover.bloomAlpha,
    );
    expect(visualButtonStateContracts.hint.base.labelAlpha).toBeLessThan(1);
    expect(visualButtonStateContracts.leaderboard.base.fillAlpha).toBeLessThan(
      visualButtonStateContracts.hint.focus.fillAlpha,
    );
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
    expect(visualTokens.motion.progressBarFillDurationMs).toEqual({
      min: 220,
      max: 320,
      recommended: 260,
    });
    expect(visualTokens.motion.targetWordTransitionDurationMs).toEqual({
      min: 180,
      max: 240,
      recommended: 220,
    });
  });

  it('provides runtime helpers for current-word transition and progress pulse', () => {
    const visualSystem = createVisualSystemModule();
    const midFrame = visualSystem.resolveCurrentWordTransition(0.5);

    expect(visualSystem.resolveCurrentWordTransition(0)).toEqual({
      outgoingAlpha: 1,
      incomingAlpha: 0,
      outgoingBlurStrength: 0,
      incomingBlurStrength: visualTokens.currentWord.blurStrength,
    });
    expect(visualSystem.resolveCurrentWordTransition(1)).toEqual({
      outgoingAlpha: 0,
      incomingAlpha: 1,
      outgoingBlurStrength: visualTokens.currentWord.blurStrength,
      incomingBlurStrength: 0,
    });
    expect(midFrame.outgoingAlpha).toBeGreaterThan(0);
    expect(midFrame.incomingAlpha).toBeGreaterThan(0.5);
    expect(midFrame.outgoingBlurStrength).toBeGreaterThan(0);
    expect(midFrame.incomingBlurStrength).toBeLessThan(visualTokens.currentWord.blurStrength);
    expect(visualSystem.resolveProgressBarPulse(0.5).glowAlpha).toBeGreaterThan(0);
    expect(visualSystem.resolveProgressBarPulse(1).glowAlpha).toBe(0);
  });
});
