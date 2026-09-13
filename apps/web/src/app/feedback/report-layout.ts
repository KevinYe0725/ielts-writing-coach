export const RESIZABLE_REPORT_MIN_WIDTH_PX = 940;

export const RESIZABLE_REPORT_QUERY =
  `(min-width: ${RESIZABLE_REPORT_MIN_WIDTH_PX}px)` as const;

export const SINGLE_PANE_REPORT_QUERY =
  `(max-width: ${RESIZABLE_REPORT_MIN_WIDTH_PX - 1}px)` as const;
