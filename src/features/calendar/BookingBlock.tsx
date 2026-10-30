import { useLayoutEffect, useState } from 'react';
import { PanResponder, Pressable, View, type GestureResponderHandlers } from 'react-native';

import { cn, Text } from '@/ui';

export type BlockTone = 'reserved' | 'active' | 'done' | 'no_show';

const tones: Record<BlockTone, string> = {
  reserved: 'border-reserved bg-reserved/20',
  active: 'border-warning bg-warning/20',
  done: 'border-border bg-border/40',
  no_show: 'border-danger/50 bg-danger/10',
};

/** Physical drag distance (px). Positive x is to the right on screen, whatever the language. */
export type DragDelta = { dx: number; dy: number };

type Props = {
  /** Distance from the timeline's start edge and width, in px. */
  offset: number;
  width: number;
  height: number;
  tone: BlockTone;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
  conflict?: boolean;
  selected?: boolean;
  /** Selected reservations can be dragged (move) and resized from the end handle. */
  draggable?: boolean;
  onPress: () => void;
  onDragEnd?: (mode: 'move' | 'resize', delta: DragDelta) => void;
  rtl: boolean;
  testID?: string;
};

/** Below this distance a drag is a tap. */
const TAP_SLOP = 6;

type DragCallbacks = { enabled: boolean; onEnd: (d: DragDelta) => void; onTap?: () => void };

/**
 * A pan responder that keeps one gesture state for the whole drag (re-creating it on every
 * render would reset it) and calls the latest callbacks when the finger lifts.
 */
class DragController {
  private callbacks: DragCallbacks = { enabled: false, onEnd: () => {} };
  readonly responder;

  /** Called after each render with the current props. */
  update(callbacks: DragCallbacks) {
    this.callbacks = callbacks;
  }

  constructor(setDrag: (d: DragDelta | null) => void) {
    this.responder = PanResponder.create({
      onStartShouldSetPanResponder: () => this.callbacks.enabled,
      onMoveShouldSetPanResponder: () => this.callbacks.enabled,
      // Don't let the scroll views take the gesture over once dragging started.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => setDrag({ dx: 0, dy: 0 }),
      onPanResponderMove: (_, g) => setDrag({ dx: g.dx, dy: g.dy }),
      onPanResponderRelease: (_, g) => {
        setDrag(null);
        if (Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) this.callbacks.onTap?.();
        else this.callbacks.onEnd({ dx: g.dx, dy: g.dy });
      },
      onPanResponderTerminate: () => setDrag(null),
    });
  }
}

function useDrag(
  enabled: boolean,
  onEnd: (delta: DragDelta) => void,
  onTap?: () => void,
): [DragDelta | null, GestureResponderHandlers] {
  const [drag, setDrag] = useState<DragDelta | null>(null);
  const [controller] = useState(() => new DragController(setDrag));
  useLayoutEffect(() => {
    controller.update({ enabled, onEnd, onTap });
  });
  return [drag, controller.responder.panHandlers];
}

/** One booking on the day timeline. */
export function BookingBlock({
  offset,
  width,
  height,
  tone,
  title,
  subtitle,
  accessibilityLabel,
  conflict,
  selected,
  draggable,
  onPress,
  onDragEnd,
  rtl,
  testID,
}: Props) {
  const enabled = !!(selected && draggable && onDragEnd);
  const [move, moveHandlers] = useDrag(enabled, (d) => onDragEnd?.('move', d), onPress);
  const [resize, resizeHandlers] = useDrag(enabled, (d) => onDragEnd?.('resize', d));

  // While resizing, the end edge follows the finger (the end is on the left in Arabic).
  const grow = resize ? (rtl ? -resize.dx : resize.dx) : 0;
  const shownWidth = Math.max(8, width + grow);
  const style = {
    start: offset,
    width: shownWidth,
    height,
    // While moving, the whole block follows the finger.
    transform: move ? [{ translateX: move.dx }, { translateY: move.dy }] : [],
    zIndex: move || resize ? 10 : selected ? 5 : 1,
  };

  const body = (
    <>
      <Text className="text-xs font-semibold" numberOfLines={1}>
        {title}
      </Text>
      {height >= 40 ? (
        <Text className="text-xs" variant="muted" numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </>
  );
  const boxClass = cn(
    'absolute top-0 overflow-hidden rounded-md border px-1.5 py-1',
    tones[tone],
    conflict && 'border-2 border-danger',
    selected && 'border-2 border-primary',
  );

  if (!enabled) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected: !!selected }}
        onPress={onPress}
        className={cn(boxClass, 'active:opacity-80')}
        style={style}
        testID={testID}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: true }}
      className={boxClass}
      style={style}
      testID={testID}
      {...moveHandlers}
    >
      {body}
      <View
        className="absolute bottom-0 top-0 w-3 items-center justify-center bg-primary/40"
        style={{ end: 0 }}
        accessibilityLabel={accessibilityLabel}
        testID={testID ? `${testID}-resize` : undefined}
        {...resizeHandlers}
      >
        <View className="h-4 w-0.5 bg-primary-foreground" />
      </View>
    </View>
  );
}
