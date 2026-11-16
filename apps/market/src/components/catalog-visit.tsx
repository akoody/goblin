'use client';
import {useEffect} from 'react';
import type {MarketArea} from '@/lib/market-area';

// Mounted only after a real page navigation, never by Next.js link prefetching.
export function CatalogVisit({slug,area}:{slug:string;area:MarketArea}) {
  useEffect(()=>{
    void fetch('/api/market-app/catalog-visits',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({slug,area}),keepalive:true}).catch(()=>{});
  },[slug,area]);
  return null;
}
