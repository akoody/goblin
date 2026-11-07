export function assetDecimal(value){
 const raw=String(value??'0');if(!/^-?\d+(\.\d+)?$/.test(raw))return '—';
 const clean=raw.replace(/(\.\d*?[1-9])0+$|\.0+$/,'$1');
 const [whole,fraction]=clean.split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'\u00a0')+(fraction?','+fraction:'');
}
export function atomicDecimal(value,decimals){
 if(!/^\d+$/.test(String(value))||!Number.isInteger(decimals)||decimals<0||decimals>30)return '—';
 const raw=String(value).padStart(decimals+1,'0');return assetDecimal(decimals?raw.slice(0,-decimals)+'.'+raw.slice(-decimals):raw);
}
