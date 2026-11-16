import api from './api';
import {detachPush} from './push';
export async function signOut() {
  if (!window.confirm('Выйти из аккаунта?')) return;
  try {await detachPush();} catch(error) {window.alert(error.message);return;}
  try { await api.post('/api/market-app/logout'); }
  finally { localStorage.removeItem('token'); window.location.assign('/login'); }
}
export async function restoreMarketSession() {
  try {const {data}=await api.get('/api/market-app/session');if(data.token)localStorage.setItem('token',data.token);}catch { /* Existing login remains available if the bridge is offline. */ }
}
