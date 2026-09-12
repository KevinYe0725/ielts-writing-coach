export type PreviewView = "workbench" | "focus";
export type PreviewStep = "notice" | "build" | "try";
export type PreviewLens = "why" | "transfer" | "limits";

export interface PreviewState {
  view: PreviewView;
  step: PreviewStep;
  example: "original" | "expanded";
  lens: PreviewLens | null;
  draft: string;
  sampleAnswer: boolean;
  comparisonOpen: boolean;
}

export type PreviewAction =
  | { type: "view"; value: PreviewView }
  | { type: "step"; value: PreviewStep }
  | { type: "example"; value: PreviewState["example"] }
  | { type: "lens"; value: PreviewLens }
  | { type: "draft"; value: string }
  | { type: "sample" }
  | { type: "compare" };

export function createPreviewState(view: PreviewView): PreviewState {
  return {
    view,
    step: "notice",
    example: "original",
    lens: "why",
    draft: "",
    sampleAnswer: false,
    comparisonOpen: false,
  };
}

// Deliberately local-only. No answers are evaluated, sent or persisted here.
export function previewReducer(
  state: PreviewState,
  action: PreviewAction,
): PreviewState {
  switch (action.type) {
    case "view":
      return { ...state, view: action.value };
    case "step":
      return { ...state, step: action.value };
    case "example":
      return { ...state, example: action.value };
    case "lens":
      return {
        ...state,
        lens: state.lens === action.value ? null : action.value,
      };
    case "draft":
      return {
        ...state,
        draft: action.value,
        sampleAnswer: false,
        comparisonOpen: false,
      };
    case "sample":
      return {
        ...state,
        draft:
          "Flexible schedules improve productivity because they are beneficial to employees.",
        sampleAnswer: true,
        comparisonOpen: false,
      };
    case "compare":
      return { ...state, comparisonOpen: !state.comparisonOpen };
  }
}
