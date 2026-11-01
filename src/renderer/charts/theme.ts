import type { CSSProperties } from 'react';

/** Shared chart styling. Values come from the approved design (mock.css / mock.js). */
export const GRID_STROKE = 'rgba(150, 168, 214, 0.12)';
export const AXIS_VALUE_COLOR = '#6f7a96';
export const AXIS_LABEL_COLOR = '#8b95ad';
export const POSITIVE = '#3ddc97';
export const ACCENT = '#6d8bff';
export const AVERAGE_STROKE = '#ffc457';
export const FLOOR_FILL = 'rgba(255, 122, 133, 0.07)';
export const FLOOR_STROKE = 'rgba(255, 122, 133, 0.5)';
export const FLOOR_TEXT = '#ff7a85';
export const INK = '#eef1f8';
export const GROUND = '#0a0d14';

export const BAR_GRADIENT_ID = 'ds-bar-gradient';
export const BAR_FADED_GRADIENT_ID = 'ds-bar-gradient-faded';
export const BAR_HORIZONTAL_GRADIENT_ID = 'ds-bar-gradient-horizontal';

const AXIS_FONT = { fontFamily: 'var(--font-numeric)', fontSize: 10 };

export const VALUE_TICK = { ...AXIS_FONT, fill: AXIS_VALUE_COLOR };
export const LABEL_TICK = { ...AXIS_FONT, fill: AXIS_LABEL_COLOR };

export const TOOLTIP_STYLE: CSSProperties = {
  background: '#182036',
  border: '1px solid rgba(150, 168, 214, 0.22)',
  borderRadius: 12,
  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
  fontSize: 12,
  color: INK,
};
export const TOOLTIP_LABEL_STYLE: CSSProperties = { color: AXIS_VALUE_COLOR };
export const TOOLTIP_CURSOR = { fill: 'rgba(150, 168, 214, 0.08)' };
