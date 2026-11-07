import { useEffect, useRef, useState } from 'react';
import styles from './ScrollableNav.module.scss';

export function ScrollableNav({ children, className, label }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const node = ref.current;
    const update = () => setEdges({ left: node.scrollLeft > 2, right: node.scrollLeft + node.clientWidth < node.scrollWidth - 2 });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    node.addEventListener('scroll', update, { passive: true });
    update();
    return () => { observer.disconnect(); node.removeEventListener('scroll', update); };
  }, [children]);
  const scroll = direction => ref.current.scrollBy({ left: direction * ref.current.clientWidth * 0.7, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  return <div className={styles.wrapper}>
    <button className={styles.arrow} type="button" aria-label="Предыдущие разделы" disabled={!edges.left} onClick={() => scroll(-1)}>←</button>
    <nav ref={ref} className={`${className || ''} ${styles.items}`} aria-label={label}>{children}</nav>
    <button className={styles.arrow} type="button" aria-label="Следующие разделы" disabled={!edges.right} onClick={() => scroll(1)}>→</button>
  </div>;
}
