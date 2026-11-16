export function pushDestination(data,userId){
 if(!data||String(data.recipientId)!==String(userId))return null;
 const path=String(data.path||'');
 return ['/me?section=transactions','/news','/about','/me','/swap','/p2p/my-deals'].includes(path)||/^\/news\?category=(project|crypto)&article=[1-9]\d*$/.test(path)||/^\/deal\/[1-9]\d*$/.test(path)||/^\/commerce\/deals\/[a-f0-9-]{36}$/i.test(path)?path:null;
}
