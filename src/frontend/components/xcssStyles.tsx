import ForgeReconciler, { xcss } from '@forge/react';

//Adapted from Atlassian docs examples: https://developer.atlassian.com/platform/forge/ui-kit/components/xcss/
export const notificationCard = xcss({
  backgroundColor: 'elevation.surface',
  padding: 'space.100',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'radius.large',
  paddingInlineStart: 'space.200',
});

export const borderCard = xcss({
  backgroundColor: 'elevation.surface',
  padding: 'space.200',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'radius.large',
  maxHeight: '300px',
  overflowY: 'scroll',
});

export const summaryBox = xcss({
  borderRadius: 'radius.large',
  padding: 'space.200',
  backgroundColor: 'color.background.accent.blue.subtlest',
  width: '100%',
});

export const statCard = xcss({
  backgroundColor: 'elevation.surface',
  padding: 'space.200',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'radius.large',
  flexGrow: '1',
  minWidth: '200px',
});

export const statCardClickable = xcss({
  backgroundColor: 'elevation.surface',
  padding: 'space.200',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'radius.large',
  flexGrow: '1',
  minWidth: '200px',
  ':hover': {
    backgroundColor: 'elevation.surface.hovered',
  },
});

export const statsRow = xcss({
  width: '100%',
});

export const rankBadge = xcss({
  backgroundColor: 'color.background.accent.blue.subtle',
  paddingInline: 'space.300',
  paddingBlock: 'space.150',
  borderRadius: 'radius.medium',
});

export const trendBadge = xcss({
  backgroundColor: 'color.background.accent.green.subtle',
  paddingInline: 'space.300',
  paddingBlock: 'space.150',
  borderRadius: 'radius.medium',
});

export const metricBadge = xcss({
  backgroundColor: 'color.background.accent.blue.subtle',
  paddingInline: 'space.300',
  paddingBlock: 'space.150',
  borderRadius: 'radius.medium',
});

export const leftPanelFilterModal = xcss({
  width: '160px',
  borderRightWidth: 'border.width',
  borderRightStyle: 'solid',
  borderRightColor: 'color.border',
  paddingRight: 'space.150',
});

export const rightPanelFilterModal = xcss({
  flexGrow: 1,
  paddingLeft: 'space.150',
});

export const visiblePanel = xcss({
  display: 'block',
});

export const hiddenPanel = xcss({
  display: 'none',
});

export const fixedFilterModalLayout = xcss({
  height: '240px',
});

export const skeletonCard = xcss({
  backgroundColor: 'color.background.neutral',
  borderRadius: 'radius.large',
  flexGrow: '1',
  height: '80px',
});

export const skeletonTopBarButton = xcss({
  backgroundColor: 'color.background.neutral',
  borderRadius: 'radius.small',
  width: '80px',
  height: '32px',
});

export const skeletonTopBarToggle = xcss({
  backgroundColor: 'color.background.neutral',
  borderRadius: 'radius.small',
  width: '160px',
  height: '32px',
});

export const skeletonTableRow = xcss({
  backgroundColor: 'color.background.neutral',
  borderRadius: 'radius.small',
  height: '36px',
});

export const skeletonHeadingLine = xcss({
  backgroundColor: 'color.background.neutral',
  borderRadius: 'radius.small',
  width: '140px',
  height: '24px',
});

export const skeletonActivityArea = xcss({
  backgroundColor: 'color.background.neutral',
  borderRadius: 'radius.large',
  height: '80px',
});

export const activeFilterTag = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'radius.small',
  paddingInlineStart: 'space.150',
  paddingBlock: 'space.025',
  backgroundColor: 'color.background.neutral',
});
