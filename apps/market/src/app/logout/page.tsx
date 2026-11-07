'use client';
import { useEffect } from 'react';
export default function Logout(){useEffect(()=>{localStorage.removeItem('token');window.location.replace('/market');},[]);return <p className="p-8 text-slate-600">Выход из аккаунта…</p>;}
