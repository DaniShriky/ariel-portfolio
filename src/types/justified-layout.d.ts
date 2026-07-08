declare module 'justified-layout' {
  export type JustifiedLayoutBox = {
    aspectRatio: number;
    top: number;
    left: number;
    width: number;
    height: number;
  };

  export type JustifiedLayoutResult = {
    containerHeight: number;
    widowCount: number;
    boxes: JustifiedLayoutBox[];
  };

  export type JustifiedLayoutConfig = {
    containerWidth?: number;
    containerPadding?: number | { top?: number; right?: number; bottom?: number; left?: number };
    boxSpacing?: number | { horizontal?: number; vertical?: number };
    targetRowHeight?: number;
    targetRowHeightTolerance?: number;
    fullWidthBreakoutRowCadence?: number | false;
    forceAspectRatio?: number | false;
    showWidows?: boolean;
    widowLayoutStyle?: 'left' | 'justify' | 'center';
  };

  export default function justifiedLayout(
    input: number[],
    config?: JustifiedLayoutConfig
  ): JustifiedLayoutResult;
}
