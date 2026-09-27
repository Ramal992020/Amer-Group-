import { useEffect, useRef } from 'react';
import { animate, useInView } from 'framer-motion';

export const fmt = (n: number): string => new Intl.NumberFormat('en-US').format(Math.round(n));

interface Props {
  value: number;
  className?: string;
}

export function AnimatedNumber({ value, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView) return;
    const controls = animate(0, value, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        node.textContent = fmt(v);
      },
    });
    return () => controls.stop();
  }, [value, inView]);

  return (
    <span ref={ref} className={className}>
      0
    </span>
  );
}
