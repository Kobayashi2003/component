import type { IntrinsicViewport } from '../../publication';
import type { FixedLayoutFit } from '../../publication';
import type { FixedLayoutPlacement } from './model';

export function calculateFixedLayoutPlacement(
  intrinsic: IntrinsicViewport,
  available: { readonly width: number; readonly height: number },
  fit: FixedLayoutFit = 'contain',
): FixedLayoutPlacement {
  assertPositive(intrinsic.width, 'intrinsic.width');
  assertPositive(intrinsic.height, 'intrinsic.height');
  assertPositive(available.width, 'available.width');
  assertPositive(available.height, 'available.height');

  const scale = fit === 'width'
    ? available.width / intrinsic.width
    : fit === 'height'
      ? available.height / intrinsic.height
      : fit === 'original'
        ? 1
        : Math.min(available.width / intrinsic.width, available.height / intrinsic.height);
  const renderedWidth = intrinsic.width * scale;
  const renderedHeight = intrinsic.height * scale;
  return {
    intrinsic: { ...intrinsic },
    available: { ...available },
    scale,
    renderedWidth,
    renderedHeight,
    offsetX: Math.max(0, (available.width - renderedWidth) / 2),
    offsetY: Math.max(0, (available.height - renderedHeight) / 2),
  };
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number.`);
}
