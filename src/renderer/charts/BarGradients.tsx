import { BAR_FADED_GRADIENT_ID, BAR_GRADIENT_ID, BAR_HORIZONTAL_GRADIENT_ID } from './theme';

/** The #8aa2ff to #4e6be8 bar fills; rendered once inside each bar chart. */
export function BarGradients(): React.JSX.Element {
  return (
    <defs>
      <linearGradient id={BAR_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8aa2ff" />
        <stop offset="1" stopColor="#4e6be8" stopOpacity={0.55} />
      </linearGradient>
      <linearGradient id={BAR_FADED_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8aa2ff" stopOpacity={0.5} />
        <stop offset="1" stopColor="#4e6be8" stopOpacity={0.15} />
      </linearGradient>
      <linearGradient id={BAR_HORIZONTAL_GRADIENT_ID} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#4e6be8" stopOpacity={0.55} />
        <stop offset="1" stopColor="#8aa2ff" />
      </linearGradient>
    </defs>
  );
}
